import { translate } from '@renderer/i18n'
import { getParentId, searchWorkbook, type SearchMatch, type SearchOptions } from '@core'
import { useEditor } from '@renderer/state/editor'
import { useSearch } from '@renderer/state/searchState'
import { getPlatformAPI } from '@renderer/lib/desktop'
import { queryDocumentMatches } from '@renderer/state/contentIndex'
import {
  flushNativeEditor,
  hasNativeEditor,
  hasPendingNativeEditor,
} from '@renderer/state/nativeEditorQueue'
import { requestTopicFocus } from '@renderer/state/viewport'
export { useSearch } from '@renderer/state/searchState'
export const searchOptions = (): SearchOptions => {
  const state = useSearch.getState()
  return {
    matchCase: state.matchCase,
    wholeWord: state.wholeWord,
    includeNotes: state.includeNotes,
    ...(state.allSheets ? {} : { sheetId: useEditor.getState().activeSheetId }),
  }
}
export const currentSearchResults = (): SearchMatch[] => {
  if (getPlatformAPI()?.compute) return []
  return searchWorkbook(useEditor.getState().workbook, useSearch.getState().query, searchOptions())
}
let revealSequence = 0
/** Accepted native navigation finishes after draft and unfolding acknowledgments. */
export const revealSearchMatch = (match: SearchMatch): boolean => {
  const editor = useEditor.getState()
  const workbookId = editor.workbook.id
  const sheet = editor.workbook.sheets.find((entry) => entry.id === match.sheetId)
  if (!sheet?.document.topics[match.topicId]) return false
  editor.commitDraft()
  if (useEditor.getState().editingId) return false
  const sequence = ++revealSequence
  const stillCurrent = (): boolean =>
    sequence === revealSequence && useEditor.getState().workbook.id === workbookId
  const navigate = (): void => {
    if (!stillCurrent() || useEditor.getState().editingId) return
    useEditor.getState().switchSheet(match.sheetId)
    const current = useEditor.getState()
    if (current.activeSheetId !== match.sheetId || !current.history.document.topics[match.topicId])
      return
    const finish = (): void => {
      const latest = useEditor.getState()
      if (
        !stillCurrent() ||
        latest.activeSheetId !== match.sheetId ||
        latest.editingId ||
        latest.selectedId !== current.selectedId ||
        !latest.history.document.topics[match.topicId]
      )
        return
      latest.select(match.topicId)
      if (match.field === 'notes')
        useEditor.setState({ inspectorOpen: true, inspectorMode: 'topic' })
      requestTopicFocus(match.topicId)
    }
    const commands = []
    let parent = getParentId(current.history.document, match.topicId)
    while (parent) {
      if (current.history.document.topics[parent]?.collapsed)
        commands.push({ type: 'toggleCollapse' as const, topicId: parent })
      parent = getParentId(current.history.document, parent)
    }
    if (!commands.length) {
      finish()
      return
    }
    const accepted = current.command({ type: 'batch', commands }, undefined, finish)
    if (accepted && !hasNativeEditor()) finish()
  }
  if (hasPendingNativeEditor(workbookId)) {
    void flushNativeEditor(workbookId)
      .then(navigate)
      .catch((error: unknown) => {
        if (stillCurrent())
          useEditor.getState().setError(error instanceof Error ? error.message : String(error))
      })
  } else navigate()
  return true
}
export const replaceSearchResults = (match?: SearchMatch): Promise<void> | void => {
  const editor = useEditor.getState()
  editor.commitDraft()
  if (useEditor.getState().editingId) return
  const current = useEditor.getState()
  const search = useSearch.getState()
  if (!search.query) return
  if (match && match.sheetId !== current.activeSheetId) {
    current.setError(translate('navigateToThisResultBeforeReplacingContent'))
    return
  }
  const sheetId = current.activeSheetId
  const workbookId = current.workbook.id
  const query = search.query
  const options = { ...searchOptions(), sheetId }
  const submit = (results: SearchMatch[]): Promise<void> | void => {
    const latest = useEditor.getState()
    const state = useSearch.getState()
    if (
      latest.workbook.id !== workbookId ||
      latest.activeSheetId !== sheetId ||
      state.query !== query ||
      state.replacement !== search.replacement ||
      latest.editingId !== null ||
      state.matchCase !== search.matchCase ||
      state.wholeWord !== search.wholeWord ||
      state.includeNotes !== search.includeNotes
    )
      return
    const selected = match
      ? results.filter(
          (result) =>
            result.sheetId === sheetId &&
            result.topicId === match.topicId &&
            result.field === match.field,
        )
      : results.filter((result) => result.sheetId === sheetId)
    const ids = [...new Set(selected.map((result) => result.topicId))]
    if (!ids.length) return
    const accepted = latest.command({
      type: 'batch',
      commands: ids.map((topicId) => ({
        type: 'replaceTopicText',
        topicId,
        query,
        replacement: search.replacement,
        matchCase: search.matchCase,
        wholeWord: search.wholeWord,
        includeNotes: search.includeNotes,
        ...(match ? { field: match.field } : {}),
      })),
    })
    if (accepted && hasNativeEditor()) return flushNativeEditor(workbookId)
  }
  if (!getPlatformAPI()?.compute) return submit(currentSearchResults())
  return queryDocumentMatches({ workbookId, query, ...options })
    .then(submit)
    .catch((error: unknown) => {
      if (useEditor.getState().workbook.id === workbookId)
        useEditor.getState().setError(error instanceof Error ? error.message : String(error))
    })
}
