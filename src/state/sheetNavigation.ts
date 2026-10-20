import { useEditor } from '@renderer/state/editor'
import { emptyEditorDraft } from '@renderer/state/editorDraft'
import {
  flushNativeEditor,
  hasNativeEditor,
  hasPendingNativeEditor,
} from '@renderer/state/nativeEditorQueue'
import { snapshot } from '@renderer/state/workbookState'

export const switchSheet = (id: string): void => {
  if (id === useEditor.getState().activeSheetId) return
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  const current = useEditor.getState()
  if (hasNativeEditor() && hasPendingNativeEditor(current.workbook.id)) {
    const workbookId = current.workbook.id
    void flushNativeEditor(workbookId)
      .then(() => {
        if (useEditor.getState().workbook.id === workbookId) useEditor.getState().switchSheet(id)
      })
      .catch((error: unknown) => {
        useEditor.getState().setError(error instanceof Error ? error.message : String(error))
      })
    return
  }
  const session = current.sessions[id]
  if (!session) {
    current.setError('画布不存在')
    return
  }
  useEditor.setState({
    sessions: snapshot(current).sessions,
    activeSheetId: id,
    history: session.history,
    selectedId: session.history.document.topics[session.selectedId]
      ? session.selectedId
      : session.history.document.rootId,
    ...emptyEditorDraft,
    dropTargetId: null,
    error: null,
  })
}
