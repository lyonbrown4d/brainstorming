import { create } from 'zustand'
import { useSearch } from '@renderer/state/searchState'

export type WorkspaceScreen = 'home' | 'editor' | 'create-document' | 'create-sheet'
interface WorkspaceState {
  readonly screen: WorkspaceScreen
  readonly hasDocument: boolean
  readonly returnScreen: 'home' | 'editor'
  readonly creationWorkbookId: string | null
  readonly creationStep: 1 | 2
}

export const useWorkspace = create<WorkspaceState>(() => ({
  screen: 'home',
  hasDocument: false,
  returnScreen: 'home',
  creationWorkbookId: null,
  creationStep: 1,
}))

export const enterWorkspaceEditor = (): void => {
  useSearch.setState({ open: false })
  useWorkspace.setState({ screen: 'editor', hasDocument: true, creationWorkbookId: null })
}
