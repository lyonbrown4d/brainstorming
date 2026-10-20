import type { ContentSearchResult } from '@shared/contentSearch'
import { useEditor } from '@renderer/state/editor'
import { switchDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { revealSearchMatch } from '@renderer/state/search'
import { flushNativeEditor, hasPendingNativeEditor } from '@renderer/state/nativeEditorQueue'

/** An old result can only navigate a target that is still open and present. */
export const openContentSearchResult = (result: ContentSearchResult): boolean => {
  const { tabs, activeId } = useDocumentTabs.getState()
  const tab = tabs.find((entry) => entry.editor.workbook.id === result.workbookId)
  if (!tab) return false
  const editor = useEditor.getState()
  const workbook =
    tab.id === activeId && editor.workbook.id === result.workbookId
      ? editor.workbook
      : tab.editor.workbook
  const sheet = workbook.sheets.find((entry) => entry.id === result.sheetId)
  if (!sheet?.document.topics[result.topicId]) return false
  editor.commitDraft()
  if (useEditor.getState().editingId) return false
  const sourceId = editor.workbook.id
  const navigate = (): boolean => {
    if (useEditor.getState().workbook.id !== sourceId) return false
    const latestTab = useDocumentTabs.getState().tabs.find((entry) => entry.id === tab.id)
    if (!latestTab) return false
    if (tab.id !== useDocumentTabs.getState().activeId && !switchDocumentTab(tab.id)) return false
    return revealSearchMatch({
      sheetId: result.sheetId,
      topicId: result.topicId,
      field: 'title',
      text: result.title,
      count: 1,
    })
  }
  if (hasPendingNativeEditor(sourceId)) {
    void flushNativeEditor(sourceId)
      .then(navigate)
      .catch((error: unknown) => {
        if (useEditor.getState().workbook.id === sourceId)
          useEditor.getState().setError(error instanceof Error ? error.message : String(error))
      })
    return true
  }
  return navigate()
}
