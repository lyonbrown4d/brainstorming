import type { ContentSearchResult } from '@shared/contentSearch'
import { useEditor } from '@renderer/state/editor'
import { switchDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { revealSearchMatch } from '@renderer/state/search'
import { requestTopicFocus } from '@renderer/state/viewport'

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
  if (tab.id !== activeId && !switchDocumentTab(tab.id)) return false
  revealSearchMatch({
    sheetId: result.sheetId,
    topicId: result.topicId,
    field: 'title',
    text: result.title,
    count: 1,
  })
  const current = useEditor.getState()
  if (
    current.workbook.id !== result.workbookId ||
    current.activeSheetId !== result.sheetId ||
    current.selectedId !== result.topicId ||
    !current.history.document.topics[result.topicId] ||
    current.editingId
  )
    return false
  requestTopicFocus(result.topicId)
  return true
}
