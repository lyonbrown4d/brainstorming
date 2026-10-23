import type { MenuContext } from '@renderer/generated/native'

export interface EditorWindow {
  readonly id: string
  readonly title: string
  readonly current: boolean
}
export interface TransferredDocument {
  readonly token: string
  /** In-process renderer session data; never written to a document or recovery file. */
  readonly session: string
}
export interface DesktopWindowsAPI {
  newWindow(): Promise<string>
  openDocumentInNewWindow(): Promise<void>
  focusWindow(windowId: string): Promise<void>
  listWindows(): Promise<readonly EditorWindow[]>
  moveDocument(session: string, targetWindowId?: string): Promise<{ windowId: string }>
  takeTransferredDocument(): Promise<TransferredDocument | null>
  acknowledgeTransfer(token: string): Promise<void>
  onDocumentTransfer(callback: () => void): () => void
  onFocusDocument(callback: (workbookId: string) => void): () => void
  syncMenuState(state: MenuContext): Promise<void>
}
