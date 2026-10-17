import type { DesktopAPI } from '@shared/contracts'
import { inactiveMCP } from '@tests/fixtures/mcp'

/** Component preview adapter only; product entry requires native Tauri initialization. */
export const createStoryDesktop = (): DesktopAPI => {
  let clipboard = ''
  return {
    platform: 'macos',
    getLanguage: () => Promise.resolve('zh-CN'),
    setLanguage: (language) => Promise.resolve(language),
    ...inactiveMCP,
    getWindowState: () => Promise.resolve({ focused: true, fullScreen: false }),
    setAppearance: () => Promise.resolve(),
    onSystemThemeChanged: () => () => undefined,
    onWindowStateChanged: () => () => undefined,
    hasOpenFile: () => Promise.resolve(false),
    takeOpenFile: () => Promise.resolve(null),
    onOpenFile: () => () => undefined,
    openDocument: () => Promise.resolve(null),
    saveDocument: () => Promise.resolve(null),
    resourceOrigin: 'http://127.0.0.1:43123',
    importDroppedFiles: () => Promise.resolve({ documents: [], assets: [] }),
    generateLinkPreview: () => Promise.reject(new Error('Preview unavailable')),
    queueLinkPreviews: () => Promise.resolve(),
    getLinkPreview: () => Promise.resolve(null),
    onLinkPreview: () => () => undefined,
    releaseDocument: () => Promise.resolve(),
    selectAsset: () => Promise.resolve(null),
    exportAsset: () => Promise.resolve(false),
    exportFile: () => Promise.resolve(null),
    openExternal: () => Promise.resolve(),
    readTopicClipboard: () => Promise.resolve(clipboard),
    writeTopicClipboard: (contents) => {
      clipboard = contents
      return Promise.resolve()
    },
    readRecovery: () => Promise.resolve(null),
    writeRecovery: () => Promise.resolve(),
    setDirty: () => undefined,
    getRecentFiles: () => Promise.resolve([]),
    openRecent: () => Promise.resolve(null),
    onMenuAction: () => () => undefined,
    getFileSecurity: () => Promise.resolve({ encrypted: false }),
    setFilePassword: () => Promise.resolve({ encrypted: false }),
    readLockedRecovery: () => Promise.resolve(null),
    readWorkspaceRecovery: () => Promise.resolve([]),
    writeWorkspaceRecovery: () => Promise.resolve(),
    listDocumentBackups: () => Promise.resolve([]),
    unlockDocument: () => Promise.reject(new Error('没有待解锁文件')),
    activateUnlockedDocument: () => Promise.resolve({ encrypted: false }),
    cancelUnlock: () => Promise.resolve(),
    restoreDocumentBackup: () => Promise.reject(new Error('没有历史版本')),
    getAISettings: () => Promise.reject(new Error('尚未配置 AI')),
    saveAISettings: () => Promise.reject(new Error('尚未配置 AI')),
    generateMindMap: () => Promise.reject(new Error('尚未配置 AI')),
    cancelAIGeneration: () => Promise.resolve(),
  }
}
