import { create } from 'zustand'
import type { MindMapDocument, MindMapWorkbook } from '@core'
import type { OpenedDocument } from '@shared/contracts'
import { editorIsDirty, useEditor } from '@renderer/state/editor'
import { stopPresentation } from '@renderer/state/presentation'
import { useWorkspace, enterWorkspaceEditor } from '@renderer/state/workspace'
import {
  captureDocumentSession,
  restoreDocumentSession,
  type DocumentSession,
} from '@renderer/state/documentSession'
import { translate } from '@renderer/i18n'
import { resetFileSecurityState, useFileSecurityState } from '@renderer/state/password'
import { defaultTopicFilters, useTopicFilters } from '@renderer/components/documents/filterTopics'
import {
  flushNativeEditor,
  hasPendingNativeEditor,
  releaseNativeEditor,
} from '@renderer/state/nativeEditorQueue'

export interface DocumentTab extends DocumentSession {
  readonly id: string
}
interface DocumentTabsState {
  readonly tabs: readonly DocumentTab[]
  readonly activeId: string | null
  readonly recovery: readonly OpenedDocument[]
}
export const useDocumentTabs = create<DocumentTabsState>(() => ({
  tabs: [],
  activeId: null,
  recovery: [],
}))
let switching = false
export const isSwitchingDocument = (): boolean => switching
const releaseClosedTab = (workbookId: string): void => {
  void releaseNativeEditor(workbookId).catch((error: unknown) => {
    useEditor.getState().setError(error instanceof Error ? error.message : String(error))
  })
}

export const synchronizeDocumentTab = (allowBusy = false): void => {
  if (
    switching ||
    (!allowBusy && useEditor.getState().busy) ||
    !useWorkspace.getState().hasDocument
  )
    return
  const state = useDocumentTabs.getState()
  const id = state.activeId ?? crypto.randomUUID()
  const previous = state.tabs.find((entry) => entry.id === id)
  const session = captureDocumentSession()
  const tab = {
    ...session,
    id,
    // Activating an incoming native key may precede switching the visible workbook.
    // Keep the outgoing key indicator while still capturing its latest edits.
    security:
      useFileSecurityState.getState().documentId !== session.editor.workbook.id &&
      previous?.editor.workbook.id === session.editor.workbook.id
        ? previous.security
        : session.security,
  }
  useDocumentTabs.setState({
    activeId: id,
    tabs: state.tabs.some((entry) => entry.id === id)
      ? state.tabs.map((entry) => (entry.id === id ? tab : entry))
      : [...state.tabs, tab],
  })
}
const commitCurrent = (): boolean => {
  if (useEditor.getState().busy) return false
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return false
  stopPresentation()
  synchronizeDocumentTab()
  return true
}
export const switchDocumentTab = (id: string): boolean => {
  if (!commitCurrent()) return false
  const workbookId = useEditor.getState().workbook.id
  if (hasPendingNativeEditor(workbookId)) {
    void flushNativeEditor(workbookId)
      .then(() => switchDocumentTab(id))
      .catch((error: unknown) => {
        useEditor.getState().setError(error instanceof Error ? error.message : String(error))
      })
    return true
  }
  const tab = useDocumentTabs.getState().tabs.find((entry) => entry.id === id)
  if (!tab) return false
  switching = true
  try {
    useDocumentTabs.setState({ activeId: id })
    restoreDocumentSession(tab)
    enterWorkspaceEditor()
  } finally {
    switching = false
  }
  synchronizeDocumentTab()
  return true
}
export const findDocumentTab = (
  path: string | null,
  workbookId?: string,
): DocumentTab | undefined =>
  useDocumentTabs
    .getState()
    .tabs.find(
      (tab) =>
        (path !== null && tab.editor.path === path) ||
        (workbookId !== undefined && tab.editor.workbook.id === workbookId),
    )

export const openDocumentTab = (
  document: MindMapDocument | MindMapWorkbook,
  path: string | null = null,
  recovered = false,
  prepared = false,
): boolean => {
  if (!prepared && !commitCurrent()) return false
  const workbookId = useEditor.getState().workbook.id
  if (hasPendingNativeEditor(workbookId)) {
    void flushNativeEditor(workbookId)
      .then(() => openDocumentTab(document, path, recovered, prepared))
      .catch((error: unknown) => {
        useEditor.getState().setError(error instanceof Error ? error.message : String(error))
      })
    return true
  }
  const existing = findDocumentTab(path, document.version === 1 ? undefined : document.id)
  if (existing) return switchDocumentTab(existing.id)
  if (useDocumentTabs.getState().tabs.length >= 32) {
    useEditor.getState().setError(translate('maxOpenMaps'))
    return false
  }
  switching = true
  try {
    useEditor.getState().replace(document, path, recovered)
    if (useFileSecurityState.getState().documentId !== useEditor.getState().workbook.id)
      resetFileSecurityState()
    useTopicFilters.setState(defaultTopicFilters)
    const id = crypto.randomUUID()
    useDocumentTabs.setState((state) => ({
      tabs: [...state.tabs, { ...captureDocumentSession(), id }],
      activeId: id,
    }))
  } finally {
    switching = false
  }
  synchronizeDocumentTab()
  return true
}

export const closeDocumentTab = (id: string): boolean => {
  if (!commitCurrent()) return false
  const state = useDocumentTabs.getState()
  const index = state.tabs.findIndex((tab) => tab.id === id)
  const tab = state.tabs[index]
  if (!tab) return false
  if (hasPendingNativeEditor(tab.editor.workbook.id)) {
    void flushNativeEditor(tab.editor.workbook.id)
      .then(() => closeDocumentTab(id))
      .catch((error: unknown) => {
        useEditor.getState().setError(error instanceof Error ? error.message : String(error))
      })
    return true
  }
  if (
    editorIsDirty(tab.editor) &&
    !window.confirm(translate('closeDirtyMap', { title: tab.editor.workbook.title }))
  )
    return false
  const tabs = state.tabs.filter((entry) => entry.id !== id)
  if (state.activeId !== id) {
    useDocumentTabs.setState({ tabs })
    releaseClosedTab(tab.editor.workbook.id)
    return true
  }
  const next = tabs[Math.min(index, tabs.length - 1)]
  switching = true
  try {
    useDocumentTabs.setState({ tabs, activeId: next?.id ?? null })
    if (next) {
      restoreDocumentSession(next)
      enterWorkspaceEditor()
    } else {
      useWorkspace.setState({
        screen: 'home',
        hasDocument: false,
        creationWorkbookId: null,
        creationStep: 1,
      })
    }
  } finally {
    switching = false
  }
  if (next) synchronizeDocumentTab()
  else useDocumentTabs.setState({ tabs: [], activeId: null })
  releaseClosedTab(tab.editor.workbook.id)
  return true
}
export const closeActiveDocument = (): void => {
  const { activeId } = useDocumentTabs.getState()
  if (activeId) closeDocumentTab(activeId)
}
export const nextDocumentTab = (offset: number): void => {
  const { tabs, activeId } = useDocumentTabs.getState()
  const index = tabs.findIndex((tab) => tab.id === activeId)
  const next = tabs[(index + offset + tabs.length) % tabs.length]
  if (next) switchDocumentTab(next.id)
}
export const anyDocumentDirty = (): boolean => {
  const { tabs, activeId } = useDocumentTabs.getState()
  return tabs.some((tab) => editorIsDirty(tab.id === activeId ? useEditor.getState() : tab.editor))
}
