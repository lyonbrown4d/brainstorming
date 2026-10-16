import type { DesktopPlatform, WindowState } from './window'
import type { DocumentAsset } from '../core'

export type MenuAction = 'new' | 'open' | 'save' | 'saveAs' | 'undo' | 'redo'
export interface OpenedDocument {
  path: string | null
  contents: string
  sourcePath?: string
  warnings?: readonly string[]
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
  readonly platform: DesktopPlatform
  getWindowState(): Promise<WindowState>
  onWindowStateChanged(callback: (state: WindowState) => void): () => void
  hasOpenFile(): Promise<boolean>
  takeOpenFile(): Promise<OpenedDocument | null>
  onOpenFile(callback: () => void): () => void
  openDocument(): Promise<OpenedDocument | null>
  selectAsset(kind: 'image' | 'attachment'): Promise<DocumentAsset | null>
  exportAsset(asset: DocumentAsset): Promise<boolean>
  saveDocument(request: SaveRequest): Promise<string | null>
  readRecovery(): Promise<string | null>
  writeRecovery(contents: string): Promise<void>
  setDirty(dirty: boolean, preserveRecovery?: boolean): void
  getRecentFiles(): Promise<RecentFile[]>
  openRecent(path: string): Promise<OpenedDocument | null>
  onMenuAction(callback: (action: MenuAction) => void): () => void
}
