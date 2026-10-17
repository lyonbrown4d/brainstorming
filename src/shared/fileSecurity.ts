import type { OpenedDocument } from '@shared/contracts'

export interface FileSecurityState {
  readonly encrypted: boolean
}
export interface DocumentBackup {
  readonly id: string
  readonly createdAt: number
  readonly size: number
  readonly encrypted: boolean
}
export interface FileSecurityAPI {
  unlockDocument(token: string, password: string): Promise<OpenedDocument>
  activateUnlockedDocument(token: string): Promise<FileSecurityState>
  cancelUnlock(token: string): Promise<void>
  getFileSecurity(documentId: string): Promise<FileSecurityState>
  setFilePassword(documentId: string, password: string | null): Promise<FileSecurityState>
  readLockedRecovery(): Promise<OpenedDocument | null>
  listDocumentBackups(documentId: string): Promise<DocumentBackup[]>
  restoreDocumentBackup(id: string): Promise<OpenedDocument>
}
export const validateFilePassword: (
  value: unknown,
  creating?: boolean,
) => asserts value is string = (value: unknown, creating = true): asserts value is string => {
  if (
    typeof value !== 'string' ||
    value.length < (creating ? 8 : 1) ||
    value.length > (creating ? 128 : 1024)
  )
    throw new Error(creating ? '密码须为 8 至 128 个字符' : '请输入有效密码')
}
export const validateSecurityDocumentId: (value: unknown) => asserts value is string = (
  value: unknown,
): asserts value is string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096)
    throw new Error('文档标识无效')
}
