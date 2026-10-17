import { validateSecurityDocumentId } from '@shared/fileSecurity'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { deserializeWorkbook, serializeWorkbook } from '@core'
import { decodeBrainstorming, encodeBrainstorming } from '@formats/brainstorming'
import {
  decryptBrainstorming,
  encryptBrainstorming,
  isEncryptedBrainstorming,
} from '@formats/encrypted'
import type { OpenedDocument } from '@shared/contracts'
import type { FileSecuritySession } from '@main/file-security/session'
import { atomicWrite } from '@main/file-security/write'
import { readDocumentBytes } from '@main/file-security/read'
import {
  recoveryFileStem,
  validateRecoveryIndex,
  type RecoveryEntry,
  type RecoveryIndexRepository,
} from '@main/workspace-recovery/repository'

/** DocumentFiles serializes recovery snapshots with password changes. */
export class RecoveryWorkspaceService {
  private readonly directory: string
  constructor(
    storageDirectory: string,
    private readonly security: FileSecuritySession,
    private readonly index: RecoveryIndexRepository,
  ) {
    this.directory = join(storageDirectory, 'recovery-v2')
  }

  prepareWrite = (input: unknown): (() => Promise<void>) => {
    if (!Array.isArray(input) || input.length > 32) throw new Error('工作区最多恢复 32 个文档')
    let total = 0
    const ids = new Set<string>()
    const plan = input.map((contents: unknown) => {
      if (typeof contents !== 'string') throw new Error('工作区恢复内容无效')
      total += Buffer.byteLength(contents)
      if (total > 128 * 1024 * 1024) throw new Error('工作区恢复内容超过 128 MiB')
      const workbook = deserializeWorkbook(contents)
      validateSecurityDocumentId(workbook.id)
      if (ids.has(workbook.id)) throw new Error('工作区恢复包含重复文档')
      ids.add(workbook.id)
      return { workbook, password: this.security.passwordFor(workbook.id) }
    })
    return async () => {
      const previous = validateRecoveryIndex(await this.index.read())
      // Never replace an existing encrypted document with plaintext before its key is accepted.
      for (const { workbook, password } of plan) {
        const existing = previous.find((entry) => entry.documentId === workbook.id)
        if (
          password === null &&
          existing &&
          (await isEncryptedBrainstorming(
            await readDocumentBytes(join(this.directory, existing.fileName)),
          ))
        )
          throw new Error('请先解锁受保护的恢复文档，不能写入明文副本')
      }
      const entries: RecoveryEntry[] = []
      await mkdir(this.directory, { recursive: true })
      try {
        // The workspace is bounded to 32 documents; sequential ZIP encoding bounds peak memory.
        for (const { workbook, password } of plan) {
          const file = `${recoveryFileStem(workbook.id)}.${randomUUID()}.brainstorming`
          const bytes =
            password === null
              ? encodeBrainstorming(workbook)
              : await encryptBrainstorming(workbook, password, 'existing')
          entries.push({ documentId: workbook.id, fileName: file, protocolVersion: 2 })
          await atomicWrite(join(this.directory, file), bytes)
        }
        await this.index.replace(entries)
      } catch (error) {
        await this.remove(entries)
        throw error
      }
      // Old snapshots remain reachable until the replacement index transaction commits.
      await this.remove(previous)
    }
  }

  read = async (): Promise<readonly OpenedDocument[]> => {
    const entries = validateRecoveryIndex(await this.index.read())
    const opened: OpenedDocument[] = []
    let totalBytes = 0
    let totalContents = 0
    try {
      for (const entry of entries) {
        const bytes = await readDocumentBytes(join(this.directory, entry.fileName))
        totalBytes += bytes.byteLength
        if (totalBytes > 128 * 1024 * 1024) throw new Error('工作区恢复内容超过 128 MiB')
        if (await isEncryptedBrainstorming(bytes))
          opened.push({
            ...this.security.lock(bytes, null, false, entry.documentId),
            recoveryId: entry.documentId,
          })
        else {
          const workbook = decodeBrainstorming(bytes)
          if (workbook.id !== entry.documentId) throw new Error('恢复工作簿与索引不一致')
          const contents = serializeWorkbook(workbook)
          totalContents += Buffer.byteLength(contents)
          if (totalContents > 128 * 1024 * 1024) throw new Error('工作区恢复内容超过 128 MiB')
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
    const stem = recoveryFileStem(documentId) + '.'
    let stored: string[]
    try {
      stored = await readdir(this.directory)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
    const orphans = stored.filter(
      (file) =>
        file.startsWith(stem) && file.endsWith('.brainstorming') && file !== entry?.fileName,
    )
    // Unreferenced generations can survive a crash; remove them before reporting protection applied.
    await Promise.all(orphans.map((file) => unlink(join(this.directory, file))))
    if (!entry) return
    const bytes = await readDocumentBytes(join(this.directory, entry.fileName))
    const encrypted = await isEncryptedBrainstorming(bytes)
    // A locked record must retain its own key until the user accepts that recovery session.
    if (encrypted && previous === null) return
    const workbook =
      encrypted && previous !== null
        ? await decryptBrainstorming(bytes, previous)
        : decodeBrainstorming(bytes)
    if (workbook.id !== documentId) throw new Error('恢复工作簿与索引不一致')
    const nextBytes =
      password === null
        ? encodeBrainstorming(workbook)
        : await encryptBrainstorming(workbook, password, 'existing')
    // Replacing this one archive atomically leaves no plaintext generation after password activation.
    await atomicWrite(join(this.directory, entry.fileName), nextBytes)
  }

  private remove = async (entries: readonly { fileName: string }[]): Promise<void> => {
    // Cleanup failure leaves an unreachable private snapshot; it must not invalidate committed data.
    await Promise.all(
      entries.map(({ fileName }) => unlink(join(this.directory, fileName)).catch(() => undefined)),
    )
  }
}
