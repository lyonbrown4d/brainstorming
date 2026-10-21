import { useEditor } from '@renderer/state/editor'
import { getSpatialView, useSpatialView, type SpatialView } from '@renderer/state/spatialView'
import { hasNativeEditor } from '@renderer/state/nativeEditorQueue'

/** A camera gesture or layout adjustment becomes one native, undoable document change. */
export const saveSpatialView = (patch: Partial<SpatialView>): boolean => {
  const editor = useEditor.getState()
  if (editor.busy) return false
  editor.commitDraft()
  const current = useEditor.getState()
  if (current.editingId) return false
  const workbookId = current.workbook.id
  const sheetId = current.activeSheetId
  useSpatialView.getState().setView(workbookId, sheetId, patch)
  const spatial = getSpatialView(workbookId, sheetId)
  const clear = () => {
    useSpatialView.getState().clearView(workbookId, sheetId)
  }
  const accepted = current.command(
    { type: 'setDocumentSettings', settings: { ...current.history.document.settings, spatial } },
    clear,
    clear,
  )
  if (!accepted || !hasNativeEditor()) clear()
  return accepted
}
