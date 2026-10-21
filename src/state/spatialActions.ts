import { useEditor } from '@renderer/state/editor'
import {
  DEFAULT_SPATIAL_VIEW,
  getSpatialView,
  useSpatialView,
  type SpatialView,
} from '@renderer/state/spatialView'
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
  // Persist only explicit edits; the render preview may be between camera presets.
  const saved = current.history.document.settings?.spatial ?? DEFAULT_SPATIAL_VIEW
  useSpatialView.getState().setView(workbookId, sheetId, { ...saved, ...patch })
  const {
    mode,
    yaw,
    pitch,
    spacing,
    target: normalizedTarget,
  } = getSpatialView(workbookId, sheetId)
  const target =
    patch.target === undefined
      ? current.history.document.settings?.spatial?.target
      : normalizedTarget
  const spatial = { mode, yaw, pitch, spacing, ...(target ? { target } : {}) }
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
