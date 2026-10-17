import { randomUUID } from 'node:crypto'
import { serializeWorkbook } from '@core'
import { decryptBrainstorming } from '@formats/encrypted'
import type { OpenedDocument } from '@shared/contracts'
import { validateFilePassword, validateSecurityDocumentId } from '@shared/fileSecurity'

interface Pending {
  readonly token: string
  readonly bytes: Uint8Array
  readonly path: string | null
  readonly expires: number
  readonly authorize: boolean
  readonly documentId?: string
  readonly timer: ReturnType<typeof setTimeout>
  unlocked?: { documentId: string; password: string }
}

/** Keys belong to document IDs, while each bounded unlock request owns an independent token. */
export class FileSecuritySession {
  private readonly pending = new Map<string, Pending>()
  private readonly passwords = new Map<string, string>()
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
  lock = (
    bytes: Uint8Array,
    path: string | null,
    authorize = false,
    documentId?: string,
  ): OpenedDocument => {
    // A workspace may contain up to 32 protected documents, plus explicit opens/history requests.
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
      ...(documentId === undefined ? {} : { documentId }),
      bytes: bytes.slice(),
      path,
      authorize,
      timer,
      expires: Date.now() + 5 * 60_000,
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
    const workbook = await decryptBrainstorming(pending.bytes, password)
    this.requirePending(token)
    if (pending.documentId !== undefined && workbook.id !== pending.documentId)
      throw new Error('恢复工作簿与索引不一致')
    pending.unlocked = { documentId: workbook.id, password }
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
    authorize: boolean
  } => {
    const pending = this.requirePending(token)
    if (!pending.unlocked) throw new Error('请先解锁文件')
    this.cancel(token)
    return { ...pending.unlocked, path: pending.path, authorize: pending.authorize }
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
