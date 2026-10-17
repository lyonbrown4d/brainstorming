import { create } from 'zustand'

interface SearchState {
  open: boolean
  query: string
  replacement: string
  matchCase: boolean
  wholeWord: boolean
  includeNotes: boolean
  allSheets: boolean
}

export const useSearch = create<SearchState>(() => ({
  open: false,
  query: '',
  replacement: '',
  matchCase: false,
  wholeWord: false,
  includeNotes: true,
  allSheets: false,
}))
