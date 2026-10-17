import { randomUUID } from 'node:crypto'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { deserializeWorkbook, serializeWorkbook, type MindMapWorkbook } from '@core'
import { NativeDocuments } from '@main/document-db'
import type { ResourceLibrary } from '@main/resources/library'
import { isEncryptedNativeFile, type FileSecuritySession } from '@main/file-security/session'
import type { OpenedDocument } from '@shared/contracts'
import { validateSecurityDocumentId } from '@shared/fileSecurity'
import {
  recoveryFileStem,
  validateRecoveryIndex,
  type RecoveryEntry,
  type RecoveryIndexRepository,
} from '@main/workspace-recovery/repository'

interface PreviousSnapshot {
  readonly path: string
  readonly workbook: MindMapWorkbook
  readonly password: string | null
}
/** Stable SQLite recovery documents share resource objects and keep the workspace index metadata-only. */
export class RecoveryWorkspaceService {
  private readonly directory: string
  constructor(
    storageDirectory: string,
    private readonly security: FileSecuritySession,
    private readonly index: RecoveryIndexRepository,
    private readonly native = new NativeDocuments(),
    private readonly resources?: ResourceLibrary,
  ) {
    this.directory = join(storageDirectory, 'recovery-sqlite-v1')
  }
  prepareWrite = (input: unknown): (() => Promise<void>) => {
    if (!Array.isArray(input) || input.length > 32) throw new Error('工作区最多恢复 32 个文档')
    let total = 0
    const ids = new Set<string>()
    const plan = input.map((contents: unknown) => {
      if (typeof contents !== 'string') throw new Error('工作区恢复内容无效')
      total += Buffer.byteLength(contents)
      if (total > 128 * 1024 * 1024) throw new Error('工作区恢复元数据超过 128 MiB')
      const workbook = deserializeWorkbook(contents)
      validateSecurityDocumentId(workbook.id)
      if (ids.has(workbook.id)) throw new Error('工作区恢复包含重复文档')
      ids.add(workbook.id)
      return { workbook, password: this.security.passwordFor(workbook.id) }
    })
    return async () => {
      const previous = validateRecoveryIndex(await this.index.read())
      const current = new Map<string, PreviousSnapshot>()
      for (const { workbook, password } of plan) {
        const entry = previous.find((item) => item.documentId === workbook.id)
        if (!entry) continue
        const path = join(this.directory, entry.fileName)
        if (password === null && (await isEncryptedNativeFile(path)))
          throw new Error('请先解锁受保护的恢复文档，不能写入明文副本')
        const stored = await this.native.read(path, password ? { password } : {})
        if (stored.id !== workbook.id) throw new Error('恢复工作簿与索引不一致')
        current.set(workbook.id, { path, workbook: stored, password })
      }
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      const entries: RecoveryEntry[] = []
      const created: RecoveryEntry[] = []
      const changed: PreviousSnapshot[] = []
      const committedSources: PreviousSnapshot[] = []
      try {
        for (const { workbook, password } of plan) {
          const prior = previous.find((item) => item.documentId === workbook.id)
          const entry = prior ?? {
            documentId: workbook.id,
            fileName: `${recoveryFileStem(workbook.id)}.${randomUUID()}.brainstorming`,
            protocolVersion: 2 as const,
          }
          const snapshot = current.get(workbook.id)
          entries.push(entry)
          if (snapshot && serializeWorkbook(snapshot.workbook) === serializeWorkbook(workbook))
            continue
          if (snapshot) changed.push(snapshot)
          else created.push(entry)
          const path = join(this.directory, entry.fileName)
          await this.native.write(path, workbook, {
            ...(password ? { password } : {}),
            ...(this.resources
              ? { source: this.resources, resources: await this.resources.packagesFor(workbook) }
              : {}),
          })
          const stored = await this.native.read(path, password ? { password } : {})
          committedSources.push({ workbook: stored, path, password })
        }
        await this.index.replace(entries)
      } catch (error) {
        // Across separate files the index has its own transaction; compensate already committed documents.
        const rollback = await Promise.allSettled(
          changed.map(async (snapshot) => {
            await this.native.write(
              snapshot.path,
              snapshot.workbook,
              snapshot.password ? { password: snapshot.password } : {},
            )
            this.resources?.register(
              snapshot.workbook,
              snapshot.path,
              snapshot.password ?? undefined,
            )
          }),
        )
        await this.remove(created)
        const failure = rollback.find((result) => result.status === 'rejected')
        if (failure?.status === 'rejected')
          throw new AggregateError([error, failure.reason], '恢复索引提交与文档回滚失败', {
            cause: error,
          })
        throw error
      }
      for (const source of committedSources)
        this.resources?.register(source.workbook, source.path, source.password ?? undefined)
      const retained = new Set(entries.map((entry) => entry.fileName))
      await this.remove(previous.filter((entry) => !retained.has(entry.fileName)))
    }
  }
  read = async (): Promise<readonly OpenedDocument[]> => {
    const entries = validateRecoveryIndex(await this.index.read())
    const opened: OpenedDocument[] = []
    let total = 0
    try {
      for (const entry of entries) {
        const path = join(this.directory, entry.fileName)
        if (await isEncryptedNativeFile(path))
          opened.push({
            ...this.security.lockFile(path, null, false, entry.documentId),
            recoveryId: entry.documentId,
          })
        else {
          const workbook = await this.native.read(path)
          if (workbook.id !== entry.documentId) throw new Error('恢复工作簿与索引不一致')
          const contents = serializeWorkbook(workbook)
          total += Buffer.byteLength(contents)
          if (total > 128 * 1024 * 1024) throw new Error('工作区恢复元数据超过 128 MiB')
          this.resources?.register(workbook, path)
          opened.push({ path: null, contents, recoveryId: entry.documentId })
        }
      }
      return opened
    } catch (cause) {
      for (const item of opened) this.security.cancel(item.lockedToken)
      throw new Error('工作区恢复文件无法读取，请保留恢复目录后重试', { cause })
    }
  }
  protect = async (
    documentId: string,
    previous: string | null,
    password: string | null,
  ): Promise<void> => {
    const entries = validateRecoveryIndex(await this.index.read())
    const entry = entries.find((item) => item.documentId === documentId)
    let stored: string[]
    try {
      stored = await readdir(this.directory)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
    const pattern = new RegExp(
      `^${recoveryFileStem(documentId)}\\.[a-f0-9-]{36}\\.brainstorming$`,
      'u',
    )
    const orphans = stored.filter((file) => pattern.test(file) && file !== entry?.fileName)
    const retained = await this.remove(orphans.map((fileName) => ({ fileName })))
    for (const path of retained) await this.protectFile(path, documentId, previous, password)
    if (entry)
      await this.protectFile(join(this.directory, entry.fileName), documentId, previous, password)
  }
  private protectFile = async (
    path: string,
    documentId: string,
    previous: string | null,
    password: string | null,
  ): Promise<void> => {
    const encrypted = await isEncryptedNativeFile(path)
    if (encrypted && previous === null) return
    let prior = encrypted ? previous : null
    let workbook: MindMapWorkbook
    try {
      workbook = await this.native.read(path, prior ? { password: prior } : {})
    } catch (cause) {
      // Compensation can revisit a file already using its target key after partial multi-file work.
      if (!encrypted || !password || password === prior) throw cause
      workbook = await this.native.read(path, { password })
      prior = password
    }
    if (workbook.id !== documentId) throw new Error('恢复工作簿与索引不一致')
    if (prior !== password) await this.native.rekey(path, prior, password)
    this.resources?.updatePassword(path, password)
  }

  private remove = async (entries: readonly { fileName: string }[]): Promise<readonly string[]> => {
    const retained = await Promise.all(
      entries.map(async ({ fileName }) => {
        const path = join(this.directory, fileName)
        if (this.resources && !this.resources.retirePath(path)) return path
        await this.native.release(path)
        await unlink(path).catch(() => undefined)
        return undefined
      }),
    )
    return retained.filter((path): path is string => path !== undefined)
  }
}
