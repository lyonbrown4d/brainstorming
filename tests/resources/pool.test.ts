import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeDocumentPools } from '@main/document-db/pool'
import { FEATURES, PROTOCOL_VERSION } from '@main/document-db/schema'

const deferred = () => {
  let resolve = () => {
    /* Replaced synchronously by the Promise executor. */
  }
  const promise = new Promise<void>((ready) => {
    resolve = ready
  })
  return { promise, resolve }
}
let directory: string
let pools: NativeDocumentPools
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brainstorming-effect-pool-'))
  pools = new NativeDocumentPools(10_000)
})
afterEach(async () => {
  await pools.dispose()
  await rm(directory, { recursive: true, force: true })
})
const initialize = (path: string, title = 'Document', password?: string) =>
  pools.withDatabase(path, password, true, async (db) => {
    await db
      .prepare('INSERT INTO document VALUES (?,?,?,?)')
      .run('document', title, PROTOCOL_VERSION, JSON.stringify(FEATURES))
    return db
  })

describe('Effect native document resource pool', () => {
  it('reuses one canonical connection while isolating document paths', async () => {
    const firstPath = join(directory, 'first.brainstorming')
    const secondPath = join(directory, 'second.brainstorming')
    const first = await initialize(firstPath, 'First')
    const second = await initialize(secondPath, 'Second')
    expect(first).not.toBe(second)
    const alias = join(directory, 'alias.brainstorming')
    await symlink(firstPath, alias)
    expect(await pools.withDatabase(alias, undefined, false, (db) => db)).toBe(first)
    expect(
      await pools.withDatabase(secondPath, undefined, false, (db) =>
        db.prepare('SELECT title FROM document').get(),
      ),
    ).toEqual({ title: 'Second' })
    await pools.release(alias)
    expect(first.driver.open).toBe(false)
    expect(second.driver.open).toBe(true)
  })

  it('serializes leases for one key while another document remains usable', async () => {
    const firstPath = join(directory, 'first.brainstorming')
    const secondPath = join(directory, 'second.brainstorming')
    await initialize(firstPath)
    const other = await initialize(secondPath)
    const entered = deferred()
    const finish = deferred()
    const order: string[] = []
    const first = pools.withDatabase(firstPath, undefined, false, async (db) => {
      order.push('first-start')
      entered.resolve()
      await finish.promise
      await db.prepare('SELECT 1').get()
      order.push('first-end')
    })
    await entered.promise
    const next = pools.withDatabase(firstPath, undefined, false, () => {
      order.push('second-start')
    })
    try {
      expect(await pools.withDatabase(secondPath, undefined, false, (db) => db)).toBe(other)
      expect(order).toEqual(['first-start'])
    } finally {
      finish.resolve()
      await Promise.all([first, next])
    }
    expect(order).toEqual(['first-start', 'first-end', 'second-start'])
  })

  it('returns a lease after a caller failure and preserves the original error', async () => {
    const path = join(directory, 'failure.brainstorming')
    const connection = await initialize(path)
    const failure = new Error('transaction failed')
    await expect(
      pools.withDatabase(path, undefined, false, () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(await pools.withDatabase(path, undefined, false, (db) => db)).toBe(connection)
    expect(
      await pools.withDatabase(path, undefined, false, (db) =>
        db.prepare('SELECT title FROM document').get(),
      ),
    ).toEqual({ title: 'Document' })
  })

  it('propagates failed opens without creating unknown read paths and permits later explicit creation', async () => {
    const path = join(directory, 'missing.brainstorming')
    let borrowed = false
    await expect(
      pools.withDatabase(path, undefined, false, () => {
        borrowed = true
      }),
    ).rejects.toThrow()
    expect(borrowed).toBe(false)
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
    const connection = await initialize(path)
    expect(connection.driver.open).toBe(true)
    expect(
      await pools.withDatabase(path, undefined, false, (db) =>
        db.prepare('SELECT title FROM document').get(),
      ),
    ).toEqual({ title: 'Document' })
  })

  it('expires idle native connections and never reuses the initial file-creation permission', async () => {
    await pools.dispose()
    pools = new NativeDocumentPools(10)
    const path = join(directory, 'idle.brainstorming')
    const connection = await initialize(path)
    await vi.waitFor(
      () => {
        expect(connection.driver.open).toBe(false)
      },
      { timeout: 2000, interval: 5 },
    )
    await rm(path)
    await expect(pools.withDatabase(path, undefined, false, () => undefined)).rejects.toThrow()
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('waits for active leases during path release and opens a fresh resource afterwards', async () => {
    const path = join(directory, 'release.brainstorming')
    const connection = await initialize(path)
    const entered = deferred()
    const finish = deferred()
    let leaseFinished = false
    const lease = pools.withDatabase(path, undefined, false, async (db) => {
      entered.resolve()
      await finish.promise
      expect(db.driver.open).toBe(true)
      await db.prepare('SELECT 1').get()
      leaseFinished = true
    })
    await entered.promise
    const released = pools.release(path).then(() => {
      expect(leaseFinished).toBe(true)
    })
    // Yield filesystem work while release begins closing its Effect scope.
    await readFile(path)
    expect(connection.driver.open).toBe(true)
    finish.resolve()
    await Promise.all([lease, released])
    expect(connection.driver.open).toBe(false)
    const replacement = await pools.withDatabase(path, undefined, false, (db) => db)
    expect(replacement).not.toBe(connection)
    expect(replacement.driver.open).toBe(true)
  })

  it('waits for active leases on disposal and rejects subsequent acquisitions', async () => {
    const path = join(directory, 'dispose.brainstorming')
    const connection = await initialize(path)
    const entered = deferred()
    const finish = deferred()
    let leaseFinished = false
    const lease = pools.withDatabase(path, undefined, false, async (db) => {
      entered.resolve()
      await finish.promise
      expect(db.driver.open).toBe(true)
      await db.prepare('SELECT 1').get()
      leaseFinished = true
    })
    await entered.promise
    const disposed = pools.dispose().then(() => {
      expect(leaseFinished).toBe(true)
    })
    expect(pools.dispose()).not.toBeUndefined()
    finish.resolve()
    await Promise.all([lease, disposed])
    expect(connection.driver.open).toBe(false)
    const unknown = join(directory, 'must-not-create.brainstorming')
    await expect(pools.withDatabase(unknown, undefined, true, () => undefined)).rejects.toThrow(
      'disposed',
    )
    await expect(stat(unknown)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('separates credentials so an incorrect password cannot reuse an already unlocked connection', async () => {
    const path = join(directory, 'encrypted.brainstorming')
    const connection = await initialize(path, 'Encrypted', 'correct-password')
    await expect(
      pools.withDatabase(path, 'incorrect-password', false, () => undefined),
    ).rejects.toThrow()
    await expect(pools.withDatabase(path, undefined, false, () => undefined)).rejects.toThrow()
    expect(await pools.withDatabase(path, 'correct-password', false, (db) => db)).toBe(connection)
    await pools.release(path)
    expect(connection.driver.open).toBe(false)
  })
})
