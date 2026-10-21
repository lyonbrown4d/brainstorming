import { useEditor } from '@renderer/state/editor'
import { DEFAULT_SPATIAL_VIEW, useSpatialView } from '@renderer/state/spatialView'

export const useActiveSpatialView = () => {
  const workbookId = useEditor((state) => state.workbook.id)
  const sheetId = useEditor((state) => state.activeSheetId)
  const persisted = useEditor((state) => state.history.document.settings?.spatial)
  const preview = useSpatialView((state) => state.views[JSON.stringify([workbookId, sheetId])])
  return { workbookId, sheetId, view: preview ?? persisted ?? DEFAULT_SPATIAL_VIEW }
}
