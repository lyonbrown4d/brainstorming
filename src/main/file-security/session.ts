import { randomUUID } from 'node:crypto'
import { lstat, open } from 'node:fs/promises'
import { serializeWorkbook, type MindMapWorkbook } from '@core'
import { decryptBrainstorming, isEncryptedBrainstorming } from '@formats/encrypted'
import { NativeDocuments } from '@main/document-db'
import type { ResourceLibrary } from '@main/resources/library'
import type { OpenedDocument } from '@shared/contracts'
import { validateFilePassword, validateSecurityDocumentId } from '@shared/fileSecurity'

interface Pending {
  readonly token: string
  readonly source: { readonly path: string } | { readonly bytes: Uint8Array }
  readonly path: string | null
  readonly expires: number
  readonly authorize: boolean
  readonly documentId?: string
  readonly timer: ReturnType<typeof setTimeout>
  unlocked?: { documentId: string; password: string; workbook: MindMapWorkbook }
}
export const isEncryptedNativeFile = async (path: string): Promise<boolean> => {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('文档文件无效')
  const file = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(128)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    return await isEncryptedBrainstorming(buffer.subarray(0, bytesRead))
  } finally {
    await file.close()
  }
}

/** Pending unlocks retain paths and metadata; passwords stay in main-process memory. */
export class FileSecuritySession {
  private readonly pending = new Map<string, Pending>()
  private readonly passwords = new Map<string, string>()
  constructor(
    private readonly native = new NativeDocuments(),
    private readonly resources?: ResourceLibrary,
  ) {}
  passwordFor = (documentId: string): string | null => this.passwords.get(documentId) ?? null
  configure = (
    documentId: unknown,
    password: unknown,
    existing = false,
  ): { encrypted: boolean } => {
    validateSecurityDocumentId(documentId)
    if (password !== null) validateFilePassword(password, !existing)
    if (password === null) this.passwords.delete(documentId)
    else this.passwords.set(documentId, password)
    return { encrypted: password !== null }
  }
  state = (documentId: unknown): { encrypted: boolean } => {
    validateSecurityDocumentId(documentId)
    return { encrypted: this.passwordFor(documentId) !== null }
  }
  lockFile = (
    sourcePath: string,
    exposedPath: string | null,
    authorize = false,
    documentId?: string,
  ): OpenedDocument => {
    return this.createPending({ path: sourcePath }, exposedPath, authorize, documentId)
  }
  /** Small fixture bridge; production callers always retain a file path. */
  lock = (
    bytes: Uint8Array,
    path: string | null,
    authorize = false,
    documentId?: string,
  ): OpenedDocument => {
    if (bytes.length > 64 * 1024 * 1024) throw new Error('内存解锁请求超过 64 MiB 限制')
    return this.createPending({ bytes: bytes.slice() }, path, authorize, documentId)
  }
  private createPending = (
    source: Pending['source'],
    path: string | null,
    authorize: boolean,
    documentId?: string,
  ): OpenedDocument => {
    if (this.pending.size >= 64) {
      const oldest = this.pending.keys().next().value
      if (oldest) this.cancel(oldest)
    }
    const token = randomUUID()
    const timer = setTimeout(() => {
      this.cancel(token)
    }, 5 * 60_000)
    timer.unref()
    this.pending.set(token, {
      token,
      source,
      path,
      authorize,
      timer,
      expires: Date.now() + 5 * 60_000,
      ...(documentId === undefined ? {} : { documentId }),
    })
    return { path, contents: '', lockedToken: token, encrypted: true }
  }
  private requirePending = (token: unknown): Pending => {
    const pending = typeof token === 'string' ? this.pending.get(token) : undefined
    if (!pending) throw new Error('解锁请求已失效，请重新选择文件')
    if (Date.now() > pending.expires) {
      this.cancel(pending.token)
      throw new Error('解锁请求已失效，请重新选择文件')
    }
    return pending
  }
  unlock = async (token: unknown, password: unknown): Promise<OpenedDocument> => {
    const pending = this.requirePending(token)
    validateFilePassword(password, false)
    let workbook: MindMapWorkbook
    try {
      workbook =
        'path' in pending.source
          ? await this.native.read(pending.source.path, { password })
          : await decryptBrainstorming(pending.source.bytes, password)
    } catch (cause) {
      throw new Error('密码错误或加密文件损坏，请重试', { cause })
    }
    this.requirePending(token)
    if (pending.documentId !== undefined && workbook.id !== pending.documentId)
      throw new Error('恢复工作簿与索引不一致')
    pending.unlocked = { documentId: workbook.id, password, workbook }
    return {
      path: pending.path,
      contents: serializeWorkbook(workbook),
      encrypted: true,
      sessionToken: pending.token,
      warnings: [],
    }
  }
  activate = (
    token: unknown,
  ): {
    documentId: string
    password: string
    path: string | null
    sourcePath?: string
    authorize: boolean
  } => {
    const pending = this.requirePending(token)
    const unlocked = pending.unlocked
    if (!unlocked) throw new Error('请先解锁文件')
    if ('path' in pending.source)
      this.resources?.register(unlocked.workbook, pending.source.path, unlocked.password)
    this.cancel(token)
    return {
      documentId: unlocked.documentId,
      password: unlocked.password,
      path: pending.path,
      authorize: pending.authorize,
      ...('path' in pending.source ? { sourcePath: pending.source.path } : {}),
    }
  }
  cancel = (token: unknown): void => {
    if (typeof token !== 'string') return
    const pending = this.pending.get(token)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(token)
  }
  dispose = (): void => {
    for (const token of this.pending.keys()) this.cancel(token)
    this.passwords.clear()
  }
}
