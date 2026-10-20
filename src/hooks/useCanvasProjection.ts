import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MindMapDocument } from '@core'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'
import { nativeLayoutQuery } from '@renderer/lib/nativeLayout'
import { queryClient } from '@renderer/lib/queryClient'
import { setNavigationLayout } from '@renderer/state/keyboard'
import { useEditor } from '@renderer/state/editor'
import {
  completeCanvasFrame,
  type CanvasProjectionFrame,
} from '@renderer/lib/canvasProjectionFrame'

/** The query key prevents results for an older document, sheet, or geometry from reaching this canvas. */
export const useCanvasProjection = (
  document: MindMapDocument,
  sheetId: string,
  surface?: string,
) => {
  const workbookId = useEditor((state) => state.workbook.id)
  const scopeId = JSON.stringify([workbookId, sheetId, document.id])
  const [completed, setCompleted] = useState<CanvasProjectionFrame | null>(null)
  const layoutQuery = useMemo(() => nativeLayoutQuery(document, sheetId), [document, sheetId])
  const [project] = useState(createCanvasProjector)
  const query = useQuery(
    {
      ...layoutQuery,
      retry: 1,
      // Keep this canvas mounted while its next geometry arrives; never carry across sheets.
      placeholderData: (previous, previousQuery) =>
        previousQuery?.queryKey[1] === sheetId && previousQuery.queryKey[2] === document.id
          ? previous
          : undefined,
    },
    queryClient,
  )
  const frame = useMemo(
    () =>
      completeCanvasFrame(
        completed,
        {
          scopeId,
          document,
          layout: query.data,
          placeholder: query.isPlaceholderData,
          surface,
        },
        project,
      ),
    [completed, scopeId, document, query.data, query.isPlaceholderData, surface, project],
  )
  // React's conditional state adjustment retains the complete frame without an effect-frame flash.
  if (frame !== completed) setCompleted(frame)
  useEffect(() => {
    if (query.data && !query.isPlaceholderData) setNavigationLayout(document, query.data)
  }, [document, query.data, query.isPlaceholderData])
  return {
    projection: frame?.projection ?? null,
    loading: query.isPending,
    error: query.error,
    retry: query.refetch,
  }
}
