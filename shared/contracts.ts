export type MenuAction = 'new' | 'open' | 'save' | 'saveAs' | 'undo' | 'redo'
export interface OpenedDocument {
  path: string
  contents: string
}
export interface RecentFile {
  path: string
  name: string
}
export interface SaveRequest {
  path: string | null
  contents: string
  suggestedName: string
}
export interface DesktopAPI {
  openDocument(): Promise<OpenedDocument | null>
  saveDocument(request: SaveRequest): Promise<string | null>
  readRecovery(): Promise<string | null>
  writeRecovery(contents: string): Promise<void>
  setDirty(dirty: boolean, preserveRecovery?: boolean): void
  getRecentFiles(): Promise<RecentFile[]>
  openRecent(path: string): Promise<OpenedDocument | null>
  onMenuAction(callback: (action: MenuAction) => void): () => void
}
