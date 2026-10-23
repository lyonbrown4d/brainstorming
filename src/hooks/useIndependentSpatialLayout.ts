import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useEditor } from '@renderer/state/editor'
import { useActiveSpatialSetting } from '@renderer/hooks/useActiveSpatialView'
import { nativeSpatialLayoutQuery } from '@renderer/lib/nativeSpatialLayout'
import { nativeMeasurements } from '@renderer/lib/nativeLayout'
import { DEFAULT_SPATIAL_VIEW } from '@renderer/state/spatialView'
import { setNavigationLayout } from '@renderer/state/keyboard'
import { queryClient } from '@renderer/lib/queryClient'

/** Only canonical document geometry and layer spacing enter the native query. */
export const useIndependentSpatialLayout = () => {
  const document = useEditor((state) => state.history.document)
  const sheetId = useEditor((state) => state.activeSheetId)
  const { value: spacing } = useActiveSpatialSetting((view) => view.spacing)
  const measurements = useMemo(() => nativeMeasurements(document), [document])
  const view = useMemo(() => ({ ...DEFAULT_SPATIAL_VIEW, mode: '3d' as const, spacing }), [spacing])
  const options = useMemo(
    () => nativeSpatialLayoutQuery(document, sheetId, view, measurements),
    [document, sheetId, view, measurements],
  )
  const result = useQuery({ ...options, retry: 1 }, queryClient)
  useEffect(() => {
    if (result.data) setNavigationLayout(document, result.data.layout)
  }, [document, result.data])
  return { ...result, document, sheetId }
}
