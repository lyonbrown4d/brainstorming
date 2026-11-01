import { create } from 'zustand'
import { useEditor } from '@renderer/state/editor'

interface InitialTopicEdit {
  workbookId: string
  sheetId: string
  topicId: string
}
export const useInitialTopicEdit = create<{
  request: InitialTopicEdit | null
  readyScope: string | null
}>(() => ({
  request: null,
  readyScope: null,
}))

/** Called by the mounted editor after its route reflects the newly created document. */
export const activateInitialTopicEdit = (): void => {
  const { request } = useInitialTopicEdit.getState()
  if (!request) return
  useInitialTopicEdit.setState({ request: null })
  const editor = useEditor.getState()
  if (
    editor.workbook.id !== request.workbookId ||
    editor.activeSheetId !== request.sheetId ||
    editor.busy ||
    editor.editingId ||
    !editor.history.document.topics[request.topicId]
  )
    return
  editor.startEdit(request.topicId, undefined, 'canvas', 'all')
}
