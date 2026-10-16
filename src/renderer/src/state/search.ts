import { create } from 'zustand'
import { getParentId, searchWorkbook, type SearchMatch, type SearchOptions } from '@core'
import { useEditor } from './editor'
import { useSpatialView } from './spatial'

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
export function searchOptions(): SearchOptions {
  const state = useSearch.getState()
  return {
    matchCase: state.matchCase,
    wholeWord: state.wholeWord,
    includeNotes: state.includeNotes,
    ...(state.allSheets ? {} : { sheetId: useEditor.getState().activeSheetId }),
  }
}
export function currentSearchResults(): SearchMatch[] {
  return searchWorkbook(useEditor.getState().workbook, useSearch.getState().query, searchOptions())
}
export function revealSearchMatch(match: SearchMatch): void {
  const editor = useEditor.getState()
  editor.commitDraft()
  if (useEditor.getState().editingId) return
  editor.switchSheet(match.sheetId)
  const current = useEditor.getState()
  if (current.activeSheetId !== match.sheetId || !current.history.document.topics[match.topicId])
    return
  const commands = []
  let parent = getParentId(current.history.document, match.topicId)
  while (parent) {
    if (current.history.document.topics[parent]?.collapsed)
      commands.push({ type: 'toggleCollapse' as const, topicId: parent })
    parent = getParentId(current.history.document, parent)
  }
  if (commands.length && !current.command({ type: 'batch', commands })) return
  current.select(match.topicId)
  useSpatialView.getState().setFocus(match.sheetId, null)
  if (match.field === 'notes') useEditor.setState({ inspectorOpen: true })
}
export function replaceSearchResults(match?: SearchMatch): void {
  const editor = useEditor.getState()
  editor.commitDraft()
  if (useEditor.getState().editingId) return
  const current = useEditor.getState()
  const search = useSearch.getState()
  if (!search.query) return
  if (match && match.sheetId !== current.activeSheetId) {
    current.setError('请先定位该结果，再替换当前画布中的内容')
    return
  }
  const ids = match
    ? [match.topicId]
    : [
        ...new Set(
          currentSearchResults()
            .filter((result) => result.sheetId === current.activeSheetId)
            .map((result) => result.topicId),
        ),
      ]
  current.command({
    type: 'batch',
    commands: ids.map((topicId) => ({
      type: 'replaceTopicText',
      topicId,
      query: search.query,
      replacement: search.replacement,
      matchCase: search.matchCase,
      wholeWord: search.wholeWord,
      includeNotes: search.includeNotes,
      ...(match ? { field: match.field } : {}),
    })),
  })
}
