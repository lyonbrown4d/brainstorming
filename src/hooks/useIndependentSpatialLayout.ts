import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useEditor } from '@renderer/state/editor'
import { useActiveSpatialSetting } from '@renderer/hooks/useActiveSpatialView'
import { nativeSpatialLayoutQuery } from '@renderer/lib/nativeSpatialLayout'
import { nativeMeasurements } from '@renderer/lib/nativeLayout'
import { DEFAULT_SPATIAL_VIEW } from '@renderer/state/spatialView'
import { setNavigationLayout } from '@renderer/state/keyboard'
import { queryClient } from '@renderer/lib/queryClient'
import { useCanvasTopicFilter } from '@renderer/hooks/useCanvasTopicFilter'
import { filterCanvasLayout } from '@renderer/lib/canvasTopicFilter'

/** Only canonical document geometry and layer spacing enter the native query. */
export const useIndependentSpatialLayout = () => {
  const document = useEditor((state) => state.history.document)
  const sheetId = useEditor((state) => state.activeSheetId)
  const { value: spacing } = useActiveSpatialSetting((view) => view.spacing)
  const filter = useCanvasTopicFilter(document)
  const measurements = useMemo(() => nativeMeasurements(filter.source), [filter.source])
  const view = useMemo(() => ({ ...DEFAULT_SPATIAL_VIEW, mode: '3d' as const, spacing }), [spacing])
  const options = useMemo(
    () => nativeSpatialLayoutQuery(filter.source, sheetId, view, measurements),
    [filter.source, sheetId, view, measurements],
  )
  const result = useQuery({ ...options, retry: 1 }, queryClient)
  const data = useMemo(
    () =>
      result.data
        ? {
            ...result.data,
            layout: filterCanvasLayout(result.data.layout, filter.visible),
          }
        : undefined,
    [result.data, filter.visible],
  )
  useEffect(() => {
    if (data) setNavigationLayout(document, data.layout)
  }, [document, data])
  return { ...result, data, document, sheetId }
}
