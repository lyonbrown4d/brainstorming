import { useEditor } from '@renderer/state/editor'
import { DEFAULT_SPATIAL_VIEW, useSpatialView, type SpatialView } from '@renderer/state/spatialView'
import { spatialLensKey, useSpatialLens, withSpatialLens } from '@renderer/state/spatialLens'

export const useActiveSpatialView = (includeLens = true, includePreview = true) => {
  const workbookId = useEditor((state) => state.workbook.id)
  const sheetId = useEditor((state) => state.activeSheetId)
  const persisted = useEditor((state) => state.history.document.settings?.spatial)
  const preview = useSpatialView((state) =>
    includePreview ? state.views[JSON.stringify([workbookId, sheetId])] : undefined,
  )
  const distance = useSpatialLens((state) =>
    includeLens ? state.distances[spatialLensKey(workbookId, sheetId)] : undefined,
  )
  return {
    workbookId,
    sheetId,
    view: withSpatialLens(preview ?? persisted ?? DEFAULT_SPATIAL_VIEW, distance),
  }
}

/** Controls that only need one setting must not subscribe to every camera pose. */
export const useActiveSpatialSetting = <Value>(select: (view: SpatialView) => Value) => {
  const workbookId = useEditor((state) => state.workbook.id)
  const sheetId = useEditor((state) => state.activeSheetId)
  const persisted = useEditor((state) => state.history.document.settings?.spatial)
  const value = useSpatialView((state) =>
    select(state.views[JSON.stringify([workbookId, sheetId])] ?? persisted ?? DEFAULT_SPATIAL_VIEW),
  )
  return { workbookId, sheetId, value }
}
