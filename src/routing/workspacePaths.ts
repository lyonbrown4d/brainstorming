import { generatePath, matchRoutes } from 'react-router'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { isCanvasSection } from '@renderer/state/inspectorNavigation'
import { useWorkspace } from '@renderer/state/workspace'

const sheetPattern = '/documents/:tabId/sheets/:sheetId'
export const workspaceRouteDefinitions = [
  { id: 'home', path: '/home' },
  { id: 'create-document', path: '/create/document/:stage?' },
  { id: 'create-sheet', path: '/create/sheet/:stage?' },
  { id: 'editor', path: sheetPattern },
  { id: 'topic-style', path: `${sheetPattern}/style/topic` },
  { id: 'canvas-style', path: `${sheetPattern}/style/canvas/:section?` },
  { id: 'composer', path: `${sheetPattern}/presentation` },
  { id: 'presenter', path: `${sheetPattern}/presentation/presenter` },
  { id: 'audience', path: `${sheetPattern}/presentation/play` },
  { id: 'settings', path: '/settings' },
] as const
export type WorkspaceRouteId = (typeof workspaceRouteDefinitions)[number]['id']
export interface WorkspaceRoute {
  readonly id: WorkspaceRouteId
  readonly stage?: string
  readonly section?: string
  readonly tabId?: string
  readonly sheetId?: string
}

export const matchWorkspacePath = (pathname: string): WorkspaceRoute | undefined => {
  const match = matchRoutes([...workspaceRouteDefinitions], pathname)?.at(-1)
  if (!match) return undefined
  if (match.params.stage && !['structure', 'configuration'].includes(match.params.stage))
    return undefined
  if (match.params.section && !isCanvasSection(match.params.section)) return undefined
  return { id: match.route.id, ...match.params }
}

export const sheetPath = (tabId: string, sheetId: string): string =>
  generatePath(sheetPattern, {
    tabId,
    sheetId,
  })

/** Navigation identifiers only: content, history and drafts remain in the existing stores. */
export const canonicalWorkspacePath = (): string => {
  const workspace = useWorkspace.getState()
  if (workspace.screen === 'home') return '/home'
  if (workspace.screen === 'create-document' || workspace.screen === 'create-sheet')
    return `/create/${workspace.screen === 'create-sheet' ? 'sheet' : 'document'}/${workspace.creationStep === 2 ? 'configuration' : 'structure'}`
  const { activeId, tabs } = useDocumentTabs.getState()
  const editor = useEditor.getState()
  if (!workspace.hasDocument || !activeId || !tabs.some((tab) => tab.id === activeId))
    return '/home'
  const base = sheetPath(activeId, editor.activeSheetId)
  const mode = usePresentation.getState().workspaceMode
  return mode === 'composer'
    ? `${base}/presentation`
    : mode === 'presenter'
      ? `${base}/presentation/presenter`
      : mode === 'audience'
        ? `${base}/presentation/play`
        : editor.inspectorOpen
          ? `${base}/style/${editor.inspectorMode === 'topic' ? 'topic' : `canvas/${editor.canvasSection}`}`
          : base
}

export const validSettingsReturn = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const route = matchWorkspacePath(value)
  if (!route || route.id === 'settings') return undefined
  if (!route.tabId)
    return route.id === 'create-sheet' && !useWorkspace.getState().hasDocument ? undefined : value
  const tab = useDocumentTabs.getState().tabs.find((entry) => entry.id === route.tabId)
  const editor =
    tab?.id === useDocumentTabs.getState().activeId ? useEditor.getState() : tab?.editor
  return editor?.workbook.sheets.some((sheet) => sheet.id === route.sheetId) ? value : undefined
}
