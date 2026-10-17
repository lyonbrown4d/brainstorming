import type { RecentFilesRepository } from '@main/storage/repositories'
import type { RecoveryWorkspaceService } from '@main/workspace-recovery/service'
import { atomicWrite } from '@main/file-security/write'
export { atomicWrite } from '@main/file-security/write'
import { mkdir } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { deserializeWorkbook, serializeWorkbook } from '@core'
import { decodeFile } from '@formats'
import { encodeTrelyx } from '@formats/trelyx'
import { encryptTrelyx, isEncryptedTrelyx } from '@formats/encrypted'
import type { FileSecuritySession } from '@main/file-security/session'
import type { DocumentBackups } from '@main/file-security/backups'
import { readDocumentBytes } from '@main/file-security/read'
import { validateFilePassword, validateSecurityDocumentId } from '@shared/fileSecurity'
import type { OpenedDocument, RecentFile } from '@shared/contracts'

// Internal pretty-printed IPC JSON may exceed the compact native entry's 10 MiB.
export const MAX_DOCUMENT_BYTES = 128 * 1024 * 1024
export const MAX_FILE_BYTES = 32 * 1024 * 1024

export const validateContents: (value: unknown) => asserts value is string = (
  value: unknown,
): asserts value is string => {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_DOCUMENT_BYTES) {
    throw new Error('文档内容无效或超过 128 MiB')
  }
  deserializeWorkbook(value)
}

const validatePath: (value: unknown, extensions: readonly string[]) => asserts value is string = (
  value: unknown,
  extensions: readonly string[],
): asserts value is string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    value.includes('\0') ||
    !extensions.includes(extname(value).toLowerCase())
  ) {
    throw new Error(`请选择 ${extensions.join(' 或 ')} 文件`)
  }
}

export const validateOpenPath: (value: unknown) => asserts value is string = (
  value: unknown,
): asserts value is string => {
  validatePath(value, ['.trelyx', '.xmind'])
}

export const validateSavePath: (value: unknown) => asserts value is string = (
  value: unknown,
): asserts value is string => {
  validatePath(value, ['.trelyx'])
}

const decodeDocument = (
  bytes: Uint8Array,
  path: string,
  exposedPath: string | null = path,
): OpenedDocument => {
  const decoded = decodeFile(bytes, path)
  const contents = serializeWorkbook(decoded.workbook)
  validateContents(contents)
  return decoded.imported
    ? { path: null, sourcePath: path, contents, warnings: decoded.warnings }
    : { path: exposedPath, contents, warnings: decoded.warnings }
}

export class DocumentFiles {
  private readonly authorizedPaths = new Set<string>()
  private recentPaths: string[] = []
  private recoveryQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly storageDirectory: string,
    private readonly security: FileSecuritySession,
    private readonly backups: DocumentBackups,
    private readonly workspace: RecoveryWorkspaceService,
    private readonly recent: RecentFilesRepository,
  ) {}

  initialize = async (): Promise<void> => {
    await mkdir(this.storageDirectory, { recursive: true })
    this.recentPaths = (await this.recent.read())
      .filter((path) => {
        try {
          validateOpenPath(path)
          return resolve(path) === path
        } catch {
          return false
        }
      })
      .slice(0, 10)
  }

  getRecentFiles = (): RecentFile[] => {
    return this.recentPaths.map((path) => ({ path, name: basename(path) }))
  }

  openSelected = async (path: string): Promise<OpenedDocument> => {
    validateOpenPath(path)
    const absolute = resolve(path)
    const bytes = await readDocumentBytes(absolute)
    if (extname(absolute).toLowerCase() === '.trelyx' && (await isEncryptedTrelyx(bytes)))
      return this.security.lock(bytes, absolute, true)
    const document = decodeDocument(bytes, absolute)
    if (document.path !== null) this.authorizedPaths.add(absolute)
    await this.remember(absolute)
    return document
  }

  openRecent = async (path: unknown): Promise<OpenedDocument> => {
    validateOpenPath(path)
    if (!this.recentPaths.includes(path)) throw new Error('文件不在最近文件列表中')
    return this.openSelected(path)
  }

  authorizeSelected = (path: string): string => {
    validateSavePath(path)
    const absolute = resolve(path)
    this.authorizedPaths.add(absolute)
    return absolute
  }

  save = async (path: string, contents: unknown, password?: string | null): Promise<string> => {
    validateContents(contents)
    validateSavePath(path)
    if (!this.authorizedPaths.has(path)) throw new Error('请先通过文件对话框选择保存位置')
    const workbook = deserializeWorkbook(contents)
    if (password !== undefined && password !== null) validateFilePassword(password)
    const key = password === undefined ? this.security.passwordFor(workbook.id) : password
    const bytes =
      key === null ? encodeTrelyx(workbook) : await encryptTrelyx(workbook, key, 'existing')
    await atomicWrite(path, bytes)
    await this.configurePassword(workbook.id, key, password === undefined)
    await this.backups.write(workbook.id, bytes, key !== null)
    await this.remember(path)
    return path
  }

  readRecovery = async (): Promise<string | null> => {
    const opened = await this.readLockedRecovery()
    if (opened?.lockedToken) {
      this.security.cancel(opened.lockedToken)
      throw new Error('自动恢复文件无法读取，请输入密码')
    }
    return opened?.contents ?? null
  }

  writeRecovery = (contents: unknown): Promise<void> => this.writeWorkspaceRecovery([contents])

  readWorkspaceRecovery = async (): Promise<readonly OpenedDocument[]> => {
    await this.recoveryQueue
    return this.workspace.read()
  }

  writeWorkspaceRecovery = (contents: unknown): Promise<void> => {
    return this.queueRecovery(this.workspace.prepareWrite(contents))
  }

  private queueRecovery = (operation: () => Promise<void>): Promise<void> => {
    const write = this.recoveryQueue.then(operation)
    this.recoveryQueue = write.catch(() => undefined)
    return write
  }

  flush = async (): Promise<void> => {
    await this.recoveryQueue
  }

  clearRecovery = (): Promise<void> => this.writeWorkspaceRecovery([])

  getFileSecurity = (documentId: unknown) => {
    return this.security.state(documentId)
  }
  setFilePassword = (documentId: unknown, password: unknown): Promise<{ encrypted: boolean }> => {
    return this.configurePassword(documentId, password)
  }
  private configurePassword = async (
    documentId: unknown,
    password: unknown,
    existing = false,
  ): Promise<{ encrypted: boolean }> => {
    validateSecurityDocumentId(documentId)
    const previous = this.security.passwordFor(documentId)
    const state = this.security.configure(documentId, password, existing)
    const key = this.security.passwordFor(documentId)
    if (key === previous) return state
    const change = this.recoveryQueue.then(async () => {
      await this.workspace.protect(documentId, previous, key)
      await this.backups.protect(documentId, key)
    })
    this.recoveryQueue = change.catch(() => undefined)
    try {
      await change
    } catch (error) {
      this.security.configure(documentId, previous, true)
      throw error
    }
    return state
  }
  unlockDocument = (token: unknown, password: unknown): Promise<OpenedDocument> => {
    return this.security.unlock(token, password)
  }
  cancelUnlock = (token: unknown): void => {
    this.security.cancel(token)
  }
  activateUnlockedDocument = async (token: unknown): Promise<{ encrypted: boolean }> => {
    const activated = this.security.activate(token)
    await this.configurePassword(activated.documentId, activated.password, true)
    if (activated.path !== null && activated.authorize) {
      this.authorizedPaths.add(activated.path)
      await this.remember(activated.path)
    }
    return { encrypted: true }
  }
  readLockedRecovery = async (): Promise<OpenedDocument | null> => {
    const [first, ...rest] = await this.readWorkspaceRecovery()
    for (const item of rest) this.security.cancel(item.lockedToken)
    return first ?? null
  }
  listDocumentBackups = (documentId: unknown) => {
    return this.backups.list(documentId)
  }
  restoreDocumentBackup = async (id: unknown): Promise<OpenedDocument> => {
    const bytes = await this.backups.read(id)
    const encrypted = await isEncryptedTrelyx(bytes)
    if (typeof id !== 'string' || id.endsWith('-e.trelyx') !== encrypted)
      throw new Error('版本文件加密状态与记录不一致')
    return encrypted
      ? this.security.lock(bytes, null)
      : decodeDocument(bytes, 'backup.trelyx', null)
  }

  private remember = async (path: string): Promise<void> => {
    this.recentPaths = [path, ...this.recentPaths.filter((entry) => entry !== path)].slice(0, 10)
    // The document is already saved/opened; recent-list failure must not report data loss.
    await this.recent.replace(this.recentPaths).catch(() => undefined)
  }
}
