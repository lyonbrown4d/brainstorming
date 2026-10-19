import { builtinArtAPI } from '@tests/fixtures/builtinArt'
import { templateAPI } from '@tests/fixtures/templates'
import { afterEach } from 'vitest'
import { installPlatformAPI } from '@renderer/lib/desktop'
import type { DesktopAPI } from '@shared/contracts'
import { inactiveMCP } from '@tests/fixtures/mcp'

const uninstallations: (() => void)[] = []
export const resetDesktopFixture = (): void => {
  while (uninstallations.length > 0) uninstallations.pop()?.()
}
afterEach(resetDesktopFixture)

export const desktop = (overrides: Partial<DesktopAPI> = {}): DesktopAPI => {
  const api: DesktopAPI = {
    ...templateAPI,
    ...builtinArtAPI,
    syncContentIndex: () => Promise.resolve(),
    searchContent: () => Promise.resolve([]),
    platform: 'macos',
    getNotificationSettings: () => Promise.resolve({ enabled: false, permission: 'granted' }),
    setNotificationsEnabled: (enabled) => Promise.resolve({ enabled, permission: 'granted' }),
    getLanguage: () => Promise.resolve('zh-CN'),
    setLanguage: (language) => Promise.resolve(language),
    ...inactiveMCP,
    unlockDocument: () => Promise.reject(new Error('没有待解锁文件')),
    activateUnlockedDocument: () => Promise.resolve({ encrypted: false }),
    cancelUnlock: () => Promise.resolve(),
    getFileSecurity: () => Promise.resolve({ encrypted: false }),
    setFilePassword: () => Promise.resolve({ encrypted: false }),
    readLockedRecovery: () => Promise.resolve(null),
    readWorkspaceRecovery: () => Promise.resolve([]),
    writeWorkspaceRecovery: () => Promise.resolve(),
    listDocumentBackups: () => Promise.resolve([]),
    restoreDocumentBackup: () => Promise.reject(new Error('没有历史版本')),
    getAISettings: () => Promise.reject(new Error('尚未配置 AI')),
    saveAISettings: () => Promise.reject(new Error('尚未配置 AI')),
    generateMindMap: () => Promise.reject(new Error('尚未配置 AI')),
    cancelAIGeneration: () => Promise.resolve(),
    setAppearance: () => Promise.resolve(),
    onSystemThemeChanged: () => () => undefined,
    getWindowState: () => Promise.resolve({ focused: true, fullScreen: false }),
    onWindowStateChanged: () => () => undefined,
    resourceOrigin: 'http://127.0.0.1:43123',
    importDroppedFiles: () => Promise.resolve({ documents: [], assets: [] }),
    generateLinkPreview: () => Promise.reject(new Error('Preview unavailable')),
    queueLinkPreviews: () => Promise.resolve(),
    getLinkPreview: () => Promise.resolve(null),
    onLinkPreview: () => () => undefined,
    getDocumentPreviewRevision: () => Promise.resolve(null),
    writeDocumentPreviews: () => Promise.resolve(false),
    exportImage: () => Promise.resolve(null),
    onExportProgress: () => () => undefined,
    releaseDocument: () => Promise.resolve(),
    selectAsset: () => Promise.resolve(null),
    exportFile: () => Promise.resolve(null),
    readTopicClipboard: () => Promise.resolve(''),
    writeTopicClipboard: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
    exportAsset: () => Promise.resolve(false),
    hasOpenFile: () => Promise.resolve(false),
    takeOpenFile: () => Promise.resolve(null),
    onOpenFile: () => () => undefined,
    openDocument: () => Promise.resolve(null),
    saveDocument: () => Promise.resolve('/map.brainstorming'),
    readRecovery: () => Promise.resolve(null),
    writeRecovery: () => Promise.resolve(),
    setDirty: () => undefined,
    getRecentFiles: () => Promise.resolve([]),
    openRecent: () => Promise.resolve(null),
    onMenuAction: () => () => undefined,
    ...overrides,
  }
  uninstallations.push(installPlatformAPI(api))
  return api
}
