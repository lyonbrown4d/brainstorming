import {
  createDocumentExportsAPI,
  documentExportProgressSchema,
} from '@renderer/lib/nativeDocumentExports'
import type { DocumentExportProgress } from '@shared/documentExports'
import { createWindowAPI } from '@renderer/lib/nativeWindowsAPI'
import { createComputeAPI } from '@renderer/lib/nativeComputeAPI'
import { builtinArtCatalogSchema, parseBuiltinArtAsset } from '@shared/builtinArt'
import { contentTemplateSchema, templateCatalogSchema, templateIdSchema } from '@shared/templates'
import { imageExportProgressSchema, type ImageExportProgress } from '@shared/exportImages'
import type { MenuActionEvent } from '@renderer/generated/native'
import type { DesktopAPI, DroppedFilesResult } from '@shared/contracts'
import type { AppLanguage } from '@shared/language'
import type { DesktopPlatform, WindowState } from '@shared/window'
import { isWindowState } from '@shared/window'
import type { MCPBridgeRequest, MCPConnection } from '@shared/mcp'
import type { NativeDrop, NativeTransport } from '@renderer/lib/nativeTransport'
import {
  normalizeOpenedDocument,
  serializeDroppedFiles,
  type NativeOpenedDocument,
} from '@renderer/lib/nativeImports'

export interface NativeInitialization {
  readonly platform: DesktopPlatform
  readonly resourceOrigin: string
  readonly language: AppLanguage
  readonly windowState: WindowState
}
export const createNativeAPI = async (
  transport: NativeTransport,
  initial: NativeInitialization,
): Promise<{ api: DesktopAPI; dispose: () => void }> => {
  const subscribers = new Map<string, Set<(payload: unknown) => void>>()
  const disposers: (() => void)[] = []
  const on = <T>(
    event: string,
    callback: (payload: T) => void,
    valid: (payload: unknown) => payload is T,
  ): (() => void) => {
    const listeners = subscribers.get(event)
    if (!listeners) throw new Error(`原生事件未注册：${event}`)
    const listener = (payload: unknown): void => {
      if (valid(payload)) callback(payload)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  const events = [
    'document-transfer',
    'focus-document',
    'export-progress',
    'document-export-progress',
    'open-file',
    'menu-action',
    'system-theme',
    'window-state',
    'link-preview',
    'mcp-request',
    'mcp-connection',
    'file-drop',
  ]
  try {
    for (const event of events) {
      const listeners = new Set<(payload: unknown) => void>()
      subscribers.set(event, listeners)
      if (event === 'file-drop') {
        if (initial.platform === 'ios' || initial.platform === 'android') continue
        disposers.push(
          await transport.onDrop((drop) => {
            if (drop) for (const callback of listeners) callback(drop)
          }),
        )
      } else
        disposers.push(
          await transport.listen(`native:${event}`, (payload) => {
            for (const callback of listeners) callback(payload)
          }),
        )
    }
  } catch (error) {
    for (const dispose of disposers) dispose()
    throw error
  }
  const request = <T>(method: string, args: Record<string, unknown> = {}): Promise<T> =>
    transport.request<T>(method, args)
  const opened = async (method: string, args = {}): Promise<NativeOpenedDocument | null> =>
    normalizeOpenedDocument(await request<NativeOpenedDocument | null>(method, args))
  const requiredDocument = (document: NativeOpenedDocument | null): NativeOpenedDocument => {
    const normalized = normalizeOpenedDocument(document)
    if (!normalized) throw new Error('原生服务未返回文档。')
    return normalized
  }
  const windowAction = transport.windowAction?.bind(transport)
  const dropped = async (
    method: string,
    args: Record<string, unknown>,
  ): Promise<DroppedFilesResult> => {
    const result = await request<
      DroppedFilesResult & { documents: readonly NativeOpenedDocument[] }
    >(method, args)
    return {
      ...result,
      documents: result.documents.map((document) => requiredDocument(document)),
    }
  }
  const send = (method: string, args: Record<string, unknown>): void => {
    void request(method, args).catch((error: unknown) => {
      console.error(`原生操作失败：${method}`, error)
    })
  }
  const api: DesktopAPI = {
    compute: createComputeAPI(),
    exports: createDocumentExportsAPI((callback) =>
      on(
        'document-export-progress',
        callback,
        (value): value is DocumentExportProgress =>
          documentExportProgressSchema.safeParse(value).success,
      ),
    ),
    windows: createWindowAPI(request, on),
    ...(windowAction
      ? {
          minimizeWindow: () => windowAction('minimize'),
          toggleMaximizeWindow: () => windowAction('toggleMaximize'),
          closeWindow: () => windowAction('close'),
        }
      : {}),
    listBuiltinArt: async () => builtinArtCatalogSchema.parse(await request('listBuiltinArt')),
    getBuiltinArt: async (id) => parseBuiltinArtAsset(await request('getBuiltinArt', { id })),
    listTemplates: async () => templateCatalogSchema.parse(await request('listTemplates')),
    getTemplate: async (id) =>
      contentTemplateSchema.parse(await request('getTemplate', { id: templateIdSchema.parse(id) })),
    exportImage: (requestValue) => request('exportImage', { request: requestValue }),
    onExportProgress: (callback) =>
      on(
        'export-progress',
        callback,
        (value): value is ImageExportProgress => imageExportProgressSchema.safeParse(value).success,
      ),
    syncContentIndex: (input) => request('syncContentIndex', { input }),
    searchContent: (input) => request('searchContent', { input }),
    platform: initial.platform,
    resourceOrigin: initial.resourceOrigin.replace(/\/$/, ''),
    getNotificationSettings: () => request('getNotificationSettings'),
    setNotificationsEnabled: (enabled) => request('setNotificationsEnabled', { enabled }),
    getLanguage: () => request('getLanguage'),
    setLanguage: (language) => request('setLanguage', { language }),
    getWindowState: () => request('getWindowState'),
    toggleFullScreen: () => request('toggleFullScreen'),
    setAppearance: (theme) => request('setAppearance', { theme }),
    onSystemThemeChanged: (callback) =>
      on('system-theme', callback, (value): value is unknown => value !== undefined),
    onWindowStateChanged: (callback) => on('window-state', callback, isWindowState),
    hasOpenFile: () => request('hasOpenFile'),
    takeOpenFile: () => opened('takeOpenFile'),
    onOpenFile: (callback) =>
      on('open-file', callback, (value): value is unknown => value !== undefined),
    openDocument: () => opened('openDocument'),
    openRecent: (path) => opened('openRecent', { path }),
    getRecentFiles: () => request('getRecentFiles'),
    getDocumentPreviewRevision: (documentId, contents) =>
      request('getDocumentPreviewRevision', { documentId, contents }),
    writeDocumentPreviews: (input) => request('writeDocumentPreviews', { ...input }),
    releaseDocument: (path) => request('releaseDocument', { path }),
    saveDocument: (requestValue) => request('saveDocument', { request: requestValue }),
    selectAsset: (kind) => request('selectAsset', { kind }),
    exportAsset: (asset) => request('exportAsset', { asset }),
    exportFile: (input) =>
      request('exportFile', { request: { ...input, bytes: Array.from(input.bytes) } }),
    importDroppedFiles: async (files) =>
      dropped('importRawFiles', { files: await serializeDroppedFiles(files) }),
    importDroppedPaths: (paths) => dropped('importDroppedFiles', { paths }),
    onNativeFileDrop: (callback) =>
      on(
        'file-drop',
        callback,
        (value): value is NativeDrop =>
          typeof value === 'object' && value !== null && 'paths' in value,
      ),
    writeTopicClipboard: (contents, plainText) =>
      request('writeTopicClipboard', { contents, plainText }),
    readTopicClipboard: () => request('readTopicClipboard'),
    openExternal: (url) => request('openExternal', { url }),
    generateLinkPreview: (url) => request('generateLinkPreview', { url }),
    queueLinkPreviews: (urls) => request('queueLinkPreviews', { urls }),
    getLinkPreview: (url) => request('getLinkPreview', { url }),
    onLinkPreview: (callback) =>
      on('link-preview', callback, (value): value is string => typeof value === 'string'),
    getAISettings: () => request('getAISettings'),
    saveAISettings: (settings) => request('saveAISettings', { settings }),
    generateMindMap: (input) => request('generateMindMap', { request: input }),
    cancelAIGeneration: (requestId) => request('cancelAIGeneration', { requestId }),
    getMCPConnection: () => request('getMCPConnection'),
    startMCPServer: (input) => request('startMCPServer', { input }),
    stopMCPServer: () => request('stopMCPServer'),
    onMCPRequest: (callback) =>
      on(
        'mcp-request',
        callback,
        (value): value is MCPBridgeRequest =>
          typeof value === 'object' && value !== null && 'action' in value && 'sessionId' in value,
      ),
    replyMCPRequest: (reply) => {
      send('replyMCPRequest', { reply })
    },
    onMCPConnectionChanged: (callback) =>
      on(
        'mcp-connection',
        callback,
        (value): value is MCPConnection | null =>
          value === null || (typeof value === 'object' && 'endpoint' in value),
      ),
    unlockDocument: async (token, password) =>
      requiredDocument(await opened('unlockDocument', { token, password })),
    activateUnlockedDocument: (token) => request('activateUnlockedDocument', { token }),
    cancelUnlock: (token) => request('cancelUnlock', { token }),
    getFileSecurity: (documentId) => request('getFileSecurity', { documentId }),
    setFilePassword: (documentId, password) => request('setFilePassword', { documentId, password }),
    readLockedRecovery: () => opened('readLockedRecovery'),
    readWorkspaceRecovery: async () =>
      (await request<NativeOpenedDocument[]>('readWorkspaceRecovery')).map((document) =>
        requiredDocument(document),
      ),
    writeWorkspaceRecovery: (contents) => request('writeWorkspaceRecovery', { contents }),
    listDocumentBackups: (documentId) => request('listDocumentBackups', { documentId }),
    restoreDocumentBackup: async (id) =>
      requiredDocument(await opened('restoreDocumentBackup', { id })),
    readRecovery: () => request('readRecovery'),
    writeRecovery: (contents) => request('writeRecovery', { contents }),
    setDirty: (dirty, preserveRecovery = false, documentTitle) => {
      send('setDirty', {
        dirty,
        preserveRecovery,
        ...(documentTitle === undefined ? {} : { documentTitle }),
      })
    },
    onMenuAction: (callback) =>
      on(
        'menu-action',
        (event: MenuActionEvent) => {
          callback(event.action, event.windowId ?? undefined)
        },
        (value): value is MenuActionEvent =>
          typeof value === 'object' &&
          value !== null &&
          'action' in value &&
          typeof value.action === 'string',
      ),
  }
  return {
    api,
    dispose: () => {
      for (const dispose of disposers) dispose()
      subscribers.clear()
    },
  }
}
