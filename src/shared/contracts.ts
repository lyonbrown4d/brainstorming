import type { LanguageAPI } from '@shared/language'
import type { DesktopPlatform, WindowState } from '@shared/window'
import type { DocumentAsset } from '@core'
import type { FileSecurityAPI } from '@shared/fileSecurity'
import type { AIAPI } from '@shared/ai'
import type { MCPAPI } from '@shared/mcp'
import type { ExportRequest } from '@shared/exports'

export type MenuAction =
  | 'closeTab'
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'undo'
  | 'redo'
  | 'zoomIn'
  | 'zoomOut'
  | 'actualSize'
  | 'centerRoot'
export interface OpenedDocument {
  recoveryId?: string
  path: string | null
  contents: string
  sourcePath?: string
  warnings?: readonly string[]
  lockedToken?: string
  sessionToken?: string
  encrypted?: boolean
}
export interface RecentFile {
  path: string
  name: string
}
export interface SaveRequest {
  path: string | null
  contents: string
  suggestedName: string
  password?: string | null
}
export interface DesktopAPI extends FileSecurityAPI, AIAPI, MCPAPI, LanguageAPI {
  readonly platform: DesktopPlatform
  getWindowState(): Promise<WindowState>
  setAppearance(theme: 'light' | 'dark'): Promise<void>
  onSystemThemeChanged(callback: () => void): () => void
  onWindowStateChanged(callback: (state: WindowState) => void): () => void
  hasOpenFile(): Promise<boolean>
  takeOpenFile(): Promise<OpenedDocument | null>
  onOpenFile(callback: () => void): () => void
  openDocument(): Promise<OpenedDocument | null>
  selectAsset(kind: 'image' | 'attachment' | 'audio'): Promise<DocumentAsset | null>
  exportAsset(asset: DocumentAsset): Promise<boolean>
  exportFile(request: ExportRequest): Promise<string | null>
  writeTopicClipboard(contents: string, plainText: string): Promise<void>
  readTopicClipboard(): Promise<string>
  openExternal(url: string): Promise<void>
  saveDocument(request: SaveRequest): Promise<string | null>
  readRecovery(): Promise<string | null>
  writeRecovery(contents: string): Promise<void>
  setDirty(dirty: boolean, preserveRecovery?: boolean): void
  getRecentFiles(): Promise<RecentFile[]>
  openRecent(path: string): Promise<OpenedDocument | null>
  onMenuAction(callback: (action: MenuAction) => void): () => void
}
