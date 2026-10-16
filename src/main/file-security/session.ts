import { randomUUID } from 'node:crypto'
import { serializeWorkbook } from '../../core'
import { decryptTrelyx } from '../../formats/encrypted'
import type { OpenedDocument } from '../../shared/contracts'
import { validateFilePassword, validateSecurityDocumentId } from '../../shared/fileSecurity'

interface Pending {
  readonly token: string
  readonly bytes: Uint8Array
  readonly path: string | null
  readonly expires: number
  readonly authorize: boolean
  unlocked?: { documentId: string; password: string }
}
export class FileSecuritySession {
  private pending: Pending | null = null
  private expiry: ReturnType<typeof setTimeout> | null = null
  private session: { documentId: string; password: string | null } | null = null
  passwordFor(documentId: string): string | null {
    return this.session?.documentId === documentId ? this.session.password : null
  }
  configure(documentId: unknown, password: unknown, existing = false): { encrypted: boolean } {
    validateSecurityDocumentId(documentId)
    if (password !== null) validateFilePassword(password, !existing)
    this.session = { documentId, password }
    return { encrypted: password !== null }
  }
  state(documentId: unknown): { encrypted: boolean } {
    validateSecurityDocumentId(documentId)
    return { encrypted: this.passwordFor(documentId) !== null }
  }
  lock(bytes: Uint8Array, path: string | null, authorize = false): OpenedDocument {
    const token = randomUUID()
    if (this.expiry) clearTimeout(this.expiry)
    this.expiry = setTimeout(() => {
      if (this.pending?.token === token) this.pending = null
    }, 5 * 60_000)
    this.expiry.unref()
    this.pending = {
      token,
      bytes: bytes.slice(),
      path,
      authorize,
      expires: Date.now() + 5 * 60_000,
    }
    return { path, contents: '', lockedToken: token, encrypted: true }
  }
  private requirePending(token: unknown): Pending {
    if (typeof token !== 'string' || token !== this.pending?.token)
      throw new Error('解锁请求已失效，请重新选择文件')
    if (Date.now() > this.pending.expires) {
      this.pending = null
      throw new Error('解锁请求已失效，请重新选择文件')
    }
    return this.pending
  }
  async unlock(token: unknown, password: unknown): Promise<OpenedDocument> {
    const pending = this.requirePending(token)
    validateFilePassword(password, false)
    const workbook = await decryptTrelyx(pending.bytes, password)
    // A second request can replace the token while decryption is running.
    this.requirePending(token)
    pending.unlocked = { documentId: workbook.id, password }
    return {
      path: pending.path,
      contents: serializeWorkbook(workbook),
      encrypted: true,
      sessionToken: pending.token,
      warnings: [],
    }
  }
  activate(token: unknown): {
    documentId: string
    password: string
    path: string | null
    authorize: boolean
  } {
    const pending = this.requirePending(token)
    if (!pending.unlocked) throw new Error('请先解锁文件')
    this.pending = null
    if (this.expiry) clearTimeout(this.expiry)
    return { ...pending.unlocked, path: pending.path, authorize: pending.authorize }
  }
  cancel(token: unknown): void {
    if (typeof token === 'string' && this.pending?.token === token) {
      this.pending = null
      if (this.expiry) clearTimeout(this.expiry)
    }
  }
}
