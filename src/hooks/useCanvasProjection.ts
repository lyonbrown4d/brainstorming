import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MindMapDocument } from '@core'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'
import { layoutMeasurements, nativeLayoutQuery } from '@renderer/lib/nativeLayout'
import { nativeSpatialLayoutQuery } from '@renderer/lib/nativeSpatialLayout'
import { getPlatformAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import { setNavigationLayout } from '@renderer/state/keyboard'
import { useEditor } from '@renderer/state/editor'
import { DEFAULT_SPATIAL_VIEW, useSpatialView } from '@renderer/state/spatialView'
import { projectSpatialLayout } from '@renderer/lib/spatialProjection'
import {
  completeCanvasFrame,
  spatialFrameReady,
  type CanvasProjectionFrame,
} from '@renderer/lib/canvasProjectionFrame'

/** The query key prevents results for an older document, sheet, or geometry from reaching this canvas. */
export const useCanvasProjection = (
  document: MindMapDocument,
  sheetId: string,
  surface?: string,
) => {
  const workbookId = useEditor((state) => state.workbook.id)
  const preview = useSpatialView((state) => state.views[JSON.stringify([workbookId, sheetId])])
  const view = preview ?? document.settings?.spatial ?? DEFAULT_SPATIAL_VIEW
  const scopeId = JSON.stringify([workbookId, sheetId, document.id])
  const [completed, setCompleted] = useState<CanvasProjectionFrame | null>(null)
  const measurements = useMemo(() => layoutMeasurements(document), [document])
  const layoutQuery = useMemo(
    () => nativeLayoutQuery(document, sheetId, measurements),
    [document, sheetId, measurements],
  )
  const depthView = useMemo(
    () => ({ ...DEFAULT_SPATIAL_VIEW, mode: '3d' as const, spacing: view.spacing }),
    [view.spacing],
  )
  const spatialQuery = useMemo(
    () => nativeSpatialLayoutQuery(document, sheetId, depthView, measurements),
    [document, sheetId, depthView, measurements],
  )
  const [project] = useState(createCanvasProjector)
  const [projectSpatial] = useState(createCanvasProjector)
  const nativeQuery = useQuery(
    {
      ...layoutQuery,
      enabled: view.mode === '2d',
      retry: 1,
      // Keep this canvas mounted while its next geometry arrives; never carry across sheets.
      placeholderData: (previous, previousQuery) =>
        previousQuery?.queryKey[1] === sheetId && previousQuery.queryKey[2] === document.id
          ? previous
          : undefined,
    },
    queryClient,
  )
  const spatialResult = useQuery(
    {
      ...spatialQuery,
      enabled: view.mode === '3d',
      retry: 1,
      placeholderData: (previous, previousQuery) =>
        previousQuery?.queryKey[1] === sheetId && previousQuery.queryKey[2] === document.id
          ? previous
          : undefined,
    },
    queryClient,
  )
  const query = view.mode === '3d' ? spatialResult : nativeQuery
  const layout = view.mode === '3d' ? spatialResult.data?.layout : nativeQuery.data
  const depths = view.mode === '3d' ? spatialResult.data?.depths : undefined
  const frame = useMemo(
    () =>
      completeCanvasFrame(
        completed,
        {
          scopeId,
          document,
          layout,
          depths,
          placeholder: query.isPlaceholderData,
          surface,
        },
        project,
      ),
    [completed, scopeId, document, layout, depths, query.isPlaceholderData, surface, project],
  )
  // React's conditional state adjustment retains the complete frame without an effect-frame flash.
  if (frame !== completed) setCompleted(frame)
  const projection = useMemo(
    () =>
      frame
        ? view.mode === '2d'
          ? frame.projection
          : !frame.depths && getPlatformAPI()?.compute
            ? frame.projection
            : projectSpatial(
                frame.document,
                projectSpatialLayout(frame.document, frame.layout, view, frame.depths),
                surface,
              )
        : null,
    [frame, view, projectSpatial, surface],
  )
  useEffect(() => {
    if (layout && !query.isPlaceholderData) setNavigationLayout(document, layout)
  }, [document, layout, query.isPlaceholderData])
  const spatialPending =
    view.mode === '3d' && !spatialFrameReady(frame, query.isPlaceholderData, query.isPending)
  return {
    projection,
    depths: view.mode === '3d' ? (frame?.depths ?? null) : null,
    interactionReady: Boolean(frame) && !spatialPending,
    spatialPending,
    loading: query.isPending,
    error: query.error,
    retry: query.refetch,
  }
}
