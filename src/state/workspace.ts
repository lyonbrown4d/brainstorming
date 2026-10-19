import { create } from 'zustand'
import type { CreationRequest } from '@renderer/components/creation/types'
import { useSearch } from '@renderer/state/searchState'

export type WorkspaceScreen = 'home' | 'editor' | 'create-document' | 'create-sheet'
export type CreationMode = 'document' | 'sheet'
export const emptyCreationDraft = (): CreationRequest => ({
  title: '',
  layout: 'map',
  template: 'blank',
})

interface WorkspaceState {
  readonly screen: WorkspaceScreen
  readonly hasDocument: boolean
  readonly returnScreen: 'home' | 'editor'
  readonly creationWorkbookId: string | null
  readonly creationStep: 1 | 2
  readonly creationDrafts: Readonly<Record<CreationMode, CreationRequest>>
}

export const useWorkspace = create<WorkspaceState>(() => ({
  screen: 'home',
  hasDocument: false,
  returnScreen: 'home',
  creationWorkbookId: null,
  creationStep: 1,
  creationDrafts: { document: emptyCreationDraft(), sheet: emptyCreationDraft() },
}))

export const enterWorkspaceEditor = (): void => {
  useSearch.setState({ open: false })
  useWorkspace.setState({ screen: 'editor', hasDocument: true, creationWorkbookId: null })
}

/** Drafts survive route changes and never enter a document or recovery record. */
export const updateCreationDraft = (mode: CreationMode, draft: CreationRequest): void => {
  useWorkspace.setState((state) => ({ creationDrafts: { ...state.creationDrafts, [mode]: draft } }))
}
