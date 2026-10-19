import { isCanvasSection } from '@renderer/state/inspectorNavigation'
import { beginCreation, showWorkspaceHome } from '@renderer/state/creation'
import {
  switchDocumentTab,
  synchronizeDocumentTab,
  useDocumentTabs,
} from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { enterWorkspaceEditor, useWorkspace } from '@renderer/state/workspace'
import {
  closePresentationWorkspace,
  openPresentationComposer,
  setPresentationMode,
  showPresentationStep,
  usePresentation,
} from '@renderer/state/presentation'
import {
  canonicalWorkspacePath,
  matchWorkspacePath,
  type WorkspaceRoute,
} from '@renderer/routing/workspacePaths'

export const commitWorkspaceNavigation = (): boolean => {
  const editor = useEditor.getState()
  if (editor.busy) return false
  editor.commitDraft()
  return !useEditor.getState().editingId
}

const activateDocumentRoute = (route: WorkspaceRoute): void => {
  const { activeId, tabs } = useDocumentTabs.getState()
  const target = tabs.find((tab) => tab.id === route.tabId)
  if (!target) return
  const targetEditor = target.id === activeId ? useEditor.getState() : target.editor
  const sheetId = targetEditor.workbook.sheets.some((sheet) => sheet.id === route.sheetId)
    ? route.sheetId
    : targetEditor.activeSheetId
  if (!sheetId || !commitWorkspaceNavigation()) return
  const switching = target.id !== activeId || sheetId !== useEditor.getState().activeSheetId
  if (switching) closePresentationWorkspace()
  if (target.id !== activeId && !switchDocumentTab(target.id)) return
  if (useEditor.getState().activeSheetId !== sheetId) useEditor.getState().switchSheet(sheetId)
  if (useEditor.getState().activeSheetId !== sheetId) return
  if (useWorkspace.getState().screen !== 'editor') enterWorkspaceEditor()
  const presentation = usePresentation.getState()
  if (route.id === 'editor' || route.id === 'topic-style' || route.id === 'canvas-style') {
    closePresentationWorkspace()
    useEditor.setState({
      inspectorOpen: route.id !== 'editor',
      ...(route.id === 'topic-style' ? { inspectorMode: 'topic' as const } : {}),
      ...(route.id === 'canvas-style'
        ? {
            inspectorMode: 'canvas' as const,
            canvasSection: isCanvasSection(route.section) ? route.section : 'structure',
          }
        : {}),
    })
  } else if (route.id === 'composer' && presentation.workspaceMode !== 'composer') {
    closePresentationWorkspace()
    openPresentationComposer()
  } else if (route.id === 'audience' || route.id === 'presenter') {
    if (!presentation.playing) showPresentationStep(0)
    setPresentationMode(route.id)
  }
  synchronizeDocumentTab()
}

/** Return the actual accepted route after the existing commit/validation guards run. */
export const applyWorkspacePath = (pathname: string): string => {
  // A reflected store command is already applied: do not commit a newly started draft again.
  if (pathname === canonicalWorkspacePath()) return pathname
  const route = matchWorkspacePath(pathname)
  if (!route) return canonicalWorkspacePath()
  if (route.id === 'settings')
    return commitWorkspaceNavigation() ? '/settings' : canonicalWorkspacePath()
  if (route.tabId) activateDocumentRoute(route)
  else if (route.id === 'home') {
    if (showWorkspaceHome()) closePresentationWorkspace()
  } else if (route.id === 'create-document' || route.id === 'create-sheet') {
    const workspace = useWorkspace.getState()
    if (workspace.screen !== route.id) {
      if (!beginCreation(route.id === 'create-sheet' ? 'sheet' : 'document'))
        return canonicalWorkspacePath()
    } else if (!commitWorkspaceNavigation()) return canonicalWorkspacePath()
    useWorkspace.setState({ creationStep: route.stage === 'configuration' ? 2 : 1 })
    closePresentationWorkspace()
  }
  return canonicalWorkspacePath()
}
