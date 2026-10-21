import { useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { getSpatialViewport } from '@renderer/state/spatialViewports'
import { useEditor } from '@renderer/state/editor'
import { canvasFitPadding } from '@renderer/hooks/useWorkbenchInsets'

/** Restore only when the target mode's complete native frame has reached React Flow. */
export const useSpatialViewportRestore = (ready: boolean): void => {
  const { view, workbookId, sheetId } = useActiveSpatialView()
  const flow = useReactFlow()
  const applied = useRef(view.mode)
  useEffect(() => {
    if (!ready || applied.current === view.mode) return
    const frame = requestAnimationFrame(() => {
      applied.current = view.mode
      const viewport = getSpatialViewport(workbookId, sheetId, view.mode)
      if (viewport) void flow.setViewport(viewport)
      else void flow.fitView({ padding: canvasFitPadding(), maxZoom: 1.2 })
      const id = useEditor.getState().selectedId
      document
        .querySelector<HTMLElement>(`.topic-input[data-topic-id="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [flow, ready, view.mode, workbookId, sheetId])
}
