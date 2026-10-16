import { create } from 'zustand'
import { useSearch } from './searchState'

export type WorkspaceScreen = 'home' | 'editor' | 'create-document' | 'create-sheet'
interface WorkspaceState {
  readonly screen: WorkspaceScreen
  readonly hasDocument: boolean
  readonly returnScreen: 'home' | 'editor'
  readonly creationWorkbookId: string | null
}

export const useWorkspace = create<WorkspaceState>(() => ({
  screen: 'home',
  hasDocument: false,
  returnScreen: 'home',
  creationWorkbookId: null,
}))

export function enterWorkspaceEditor(): void {
  useSearch.setState({ open: false })
  useWorkspace.setState({ screen: 'editor', hasDocument: true, creationWorkbookId: null })
}
