import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MindMapDocument } from '@core'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'
import { nativeMeasurements, nativeLayoutQuery } from '@renderer/lib/nativeLayout'
import { queryClient } from '@renderer/lib/queryClient'
import { setNavigationLayout } from '@renderer/state/keyboard'
import { useEditor } from '@renderer/state/editor'
import { createCanvasProjectionController } from '@renderer/lib/canvasProjectionController'
import { useCanvasCameraProjection } from '@renderer/hooks/useCanvasCameraProjection'
import {
  completeCanvasFrame,
  type CanvasProjectionFrame,
} from '@renderer/lib/canvasProjectionFrame'

/** Native 2D geometry stays scoped to its document and sheet while a refresh is pending. */
export const useCanvasProjection = (
  document: MindMapDocument,
  sheetId: string,
  surface?: string,
) => {
  const workbookId = useEditor((state) => state.workbook.id)
  const scopeId = JSON.stringify([workbookId, sheetId, document.id])
  const controller = useMemo(() => createCanvasProjectionController(scopeId), [scopeId])
  const [completed, setCompleted] = useState<CanvasProjectionFrame | null>(null)
  const measurements = useMemo(() => nativeMeasurements(document), [document])
  const options = useMemo(
    () => nativeLayoutQuery(document, sheetId, measurements),
    [document, sheetId, measurements],
  )
  const [project] = useState(createCanvasProjector)
  const query = useQuery(
    {
      ...options,
      retry: 1,
      placeholderData: (previous, previousQuery) =>
        previousQuery?.queryKey[1] === sheetId && previousQuery.queryKey[2] === document.id
          ? previous
          : undefined,
    },
    queryClient,
  )
  const layout = query.data
  const frame = useMemo(
    () =>
      completeCanvasFrame(
        completed,
        { scopeId, document, layout, placeholder: query.isPlaceholderData, surface },
        project,
      ),
    [completed, scopeId, document, layout, query.isPlaceholderData, surface, project],
  )
  if (frame !== completed) setCompleted(frame)
  useCanvasCameraProjection(controller, frame)
  useEffect(() => {
    if (layout && !query.isPlaceholderData) setNavigationLayout(document, layout)
  }, [document, layout, query.isPlaceholderData])
  return {
    controller,
    projectionReady: Boolean(frame),
    nativeLayout: frame?.layout,
    interactionReady: Boolean(frame),
    loading: query.isPending,
    error: query.error,
    retry: query.refetch,
  }
}
