import { useEditor } from '@renderer/state/editor'
import { DEFAULT_SPATIAL_VIEW, useSpatialView } from '@renderer/state/spatialView'
import { spatialLensKey, useSpatialLens, withSpatialLens } from '@renderer/state/spatialLens'

export const useActiveSpatialView = () => {
  const workbookId = useEditor((state) => state.workbook.id)
  const sheetId = useEditor((state) => state.activeSheetId)
  const persisted = useEditor((state) => state.history.document.settings?.spatial)
  const preview = useSpatialView((state) => state.views[JSON.stringify([workbookId, sheetId])])
  const distance = useSpatialLens((state) => state.distances[spatialLensKey(workbookId, sheetId)])
  return {
    workbookId,
    sheetId,
    view: withSpatialLens(preview ?? persisted ?? DEFAULT_SPATIAL_VIEW, distance),
  }
}
