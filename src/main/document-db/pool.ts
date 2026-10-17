import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { Migrator } from 'kysely/migration'
import { Cause, Effect, Exit, Pool, Scope } from 'effect'
import { NativeConnection } from '@main/document-db/connection'
import {
  APPLICATION_ID,
  FEATURES,
  MIGRATION_ID,
  migrationProvider,
  PROTOCOL_VERSION,
} from '@main/document-db/schema'

export const canonicalPath = async (path: string): Promise<string> => {
  const absolute = resolve(path)
  return realpath(absolute).catch(async () => {
    // New files still share the canonical parent key (for example /var -> /private/var on macOS).
    const parent = await realpath(dirname(absolute)).catch(() => dirname(absolute))
    return join(parent, basename(absolute))
  })
}

export const checkProtocol = async (db: NativeConnection, allowEmpty = false): Promise<void> => {
  const tables = (await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()) as {
    name: string
  }[]
  if (allowEmpty && tables.length === 0) return
  if (db.driver.pragma('application_id', { simple: true }) !== APPLICATION_ID)
    throw new Error('文件不是 Brainstorming SQLite 原生文档')
  const metadata = (await db.prepare('SELECT protocol, required_features FROM document').all()) as {
    protocol: number
    required_features: string
  }[]
  if (metadata.length !== 1 || metadata[0]?.protocol !== PROTOCOL_VERSION)
    throw new Error('不支持此 Brainstorming 原生文档版本')
  const features: unknown = JSON.parse(metadata[0].required_features)
  if (
    !Array.isArray(features) ||
    features.some((feature: unknown) => !FEATURES.includes(feature as (typeof FEATURES)[number]))
  )
    throw new Error('当前版本不支持此 Brainstorming 必需功能')
  const migrations = (await db.prepare('SELECT name FROM kysely_migration').all()) as {
    name: string
  }[]
  if (migrations.some(({ name }) => name > MIGRATION_ID))
    throw new Error('文档迁移版本高于当前应用')
}

const openDatabase = async (
  path: string,
  password: string | undefined,
  create: boolean,
): Promise<NativeConnection> => {
  const db = new NativeConnection(new Database(path, { fileMustExist: !create }))
  try {
    if (password) {
      db.driver.pragma("cipher = 'sqlcipher'")
      db.driver.key(Buffer.from(password))
    }
    await checkProtocol(db, create)
    db.driver.pragma('journal_mode = DELETE')
    db.driver.pragma('synchronous = FULL')
    db.driver.pragma('busy_timeout = 5000')
    const kysely = db.kysely
    const result = await new Migrator({ db: kysely, provider: migrationProvider }).migrateToLatest()
    if (result.error) throw new Error('文档数据库迁移失败', { cause: result.error })
    return db
  } catch (cause) {
    await db.close()
    throw new Error('无法打开 Brainstorming 文档，文件可能损坏、格式不受支持或密码不正确', {
      cause,
    })
  }
}

interface PoolEntry {
  path: string
  scope: Scope.Closeable
  ready: Promise<Pool.Pool<NativeConnection, unknown>>
  requests: number
  closing?: Promise<void>
  timer?: ReturnType<typeof setTimeout>
}

const runEffect = async <T>(effect: Effect.Effect<T, unknown>): Promise<T> => {
  const result = await Effect.runPromiseExit(effect)
  if (Exit.isFailure(result)) throw Cause.squash(result.cause)
  return result.value
}

export class NativeDocumentPools {
  private readonly entries = new Map<string, PoolEntry>()
  private disposed = false
  private disposal: Promise<void> | undefined
  private readonly idleTimeoutMillis: number

  constructor(idleTimeoutMillis = 30_000) {
    if (!Number.isFinite(idleTimeoutMillis) || idleTimeoutMillis <= 0) {
      throw new Error('Connection idle timeout must be positive')
    }
    this.idleTimeoutMillis = idleTimeoutMillis
  }

  private ensureOpen = (): void => {
    if (this.disposed) throw new Error('Document connection pools are disposed')
  }

  private makeEntry = (path: string, password: string | undefined, create: boolean): PoolEntry => {
    const scope = Scope.makeUnsafe()
    // Creation permission belongs only to this initial acquisition. TTL replacements always
    // require the file to exist, so a later read cannot recreate a missing document.
    let mayCreate = create
    const acquire = Effect.acquireRelease(
      Effect.tryPromise({
        try: () => {
          const initialCreate = mayCreate
          mayCreate = false
          return openDatabase(path, password, initialCreate)
        },
        catch: (cause) => cause,
      }),
      (db) => Effect.promise(() => db.close()),
    )
    const ready = Effect.runPromise(
      Scope.provide(
        Pool.makeWithTTL({
          acquire,
          min: 0,
          max: 1,
          concurrency: 1,
          timeToLive: this.idleTimeoutMillis,
          timeToLiveStrategy: 'usage',
        }),
        scope,
      ),
    )
    return { path, scope, ready, requests: 0 }
  }

  private retire = (key: string, entry: PoolEntry): Promise<void> => {
    if (entry.closing) return entry.closing
    if (entry.timer) clearTimeout(entry.timer)
    const closing = (async () => {
      try {
        await entry.ready
        // Effect's pool finalizer waits for borrowed resources before closing the driver.
        await runEffect(Scope.close(entry.scope, Exit.void))
      } finally {
        if (this.entries.get(key) === entry) this.entries.delete(key)
      }
    })()
    entry.closing = closing
    return closing
  }

  withDatabase = async <T>(
    path: string,
    password: string | undefined,
    create: boolean,
    run: (db: NativeConnection) => Promise<T> | T,
  ): Promise<T> => {
    this.ensureOpen()
    const canonical = await canonicalPath(path)
    this.ensureOpen()
    const credential = createHash('sha256')
      .update(password ?? '')
      .digest('hex')
    const key = `${canonical}\0${credential}`
    let entry = this.entries.get(key)
    if (entry?.closing) {
      await entry.closing
      return this.withDatabase(path, password, create, run)
    }
    if (!entry) {
      entry = this.makeEntry(canonical, password, create)
      this.entries.set(key, entry)
    }
    if (entry.timer) clearTimeout(entry.timer)
    entry.requests += 1
    const lease = { borrowed: false }
    try {
      const pool = await entry.ready
      return await runEffect(
        Pool.use(pool, (db) => {
          lease.borrowed = true
          return Effect.tryPromise({ try: async () => run(db), catch: (cause) => cause })
        }),
      )
    } catch (error) {
      // Failed opens must not pin a read-only creation policy or a failed resource slot.
      if (!lease.borrowed) await this.retire(key, entry)
      throw error
    } finally {
      entry.requests -= 1
      if (!entry.requests && !entry.closing && !this.disposed) {
        const idleEntry = entry
        // The official pool expires idle connections within one to two TTL periods.
        // Retire its now-unused scope as well, releasing password closures and background fibers.
        idleEntry.timer = setTimeout(() => {
          void this.retire(key, idleEntry).catch(() => {
            /* No caller remains for idle cleanup. */
          })
        }, this.idleTimeoutMillis * 2)
        idleEntry.timer.unref()
      }
    }
  }

  release = async (path: string): Promise<void> => {
    const canonical = await canonicalPath(path)
    const entries = [...this.entries].filter(([, entry]) => entry.path === canonical)
    await Promise.all(entries.map(([key, entry]) => this.retire(key, entry)))
  }

  dispose = (): Promise<void> => {
    if (this.disposal) return this.disposal
    this.disposed = true
    this.disposal = Promise.all(
      [...this.entries].map(([key, entry]) => this.retire(key, entry)),
    ).then(() => undefined)
    return this.disposal
  }
}
