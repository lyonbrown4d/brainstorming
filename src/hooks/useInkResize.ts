import { getSpatialView, useSpatialView, type SpatialView } from '@renderer/state/spatialView'
import { projectedInkBounds, resizeSpatialInk } from '@renderer/lib/spatialInk'
import { useCallback, useEffect, useRef } from 'react'
import { useReactFlow, type NodeResizerProps } from '@xyflow/react'
import type { CanvasStroke, MindMapDocument } from '@core'
import { transformInk, type InkBounds } from '@shared/ink-geometry'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'

interface ResizeSession {
  stroke: CanvasStroke
  bounds: InkBounds
  document: MindMapDocument
  sheetId: string
  view: SpatialView
  workbookId: string
}

/** React Flow owns resize preview. One pointer release produces one ordinary document command. */
export const useInkResize = (
  id: string,
  stroke: CanvasStroke,
): Pick<NodeResizerProps, 'shouldResize' | 'onResizeStart' | 'onResizeEnd'> => {
  const flow = useReactFlow<CanvasFlowNode>()
  const session = useRef<ResizeSession | null>(null)
  const cancelled = useRef(false)
  const restore = useCallback(
    (bounds: InkBounds): void => {
      flow.updateNode(id, {
        position: { x: bounds.x, y: bounds.y },
        width: bounds.width,
        height: bounds.height,
        resizing: false,
        style: { width: bounds.width, height: bounds.height, pointerEvents: 'none' },
      })
    },
    [flow, id],
  )
  useEffect(() => {
    const cancel = (): void => {
      const active = session.current
      if (!active) return
      session.current = null
      cancelled.current = true
      restore(active.bounds)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || !session.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancel()
    }
    const unsubscribe = useEditor.subscribe((state) => {
      const active = session.current
      if (
        active &&
        (state.workbook.id !== active.workbookId ||
          state.activeSheetId !== active.sheetId ||
          state.history.document !== active.document ||
          state.busy)
      )
        cancel()
    })
    const stopView = useSpatialView.subscribe(() => {
      const active = session.current
      if (active && getSpatialView(active.workbookId, active.sheetId) !== active.view) cancel()
    })
    const stopPlaying = usePresentation.subscribe((state) => {
      if (state.playing) cancel()
    })
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('pointercancel', cancel)
    return () => {
      // Unmounting never writes history or another canvas's React Flow state.
      session.current = null
      unsubscribe()
      stopPlaying()
      stopView()
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [restore])
  return {
    shouldResize: (_event, bounds) => {
      const active = session.current
      if (!active || cancelled.current) return false
      const transform = transformInk(active.stroke, active.bounds, bounds).transform
      return Boolean(
        transform &&
        [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) &&
        bounds.x >= -1_000_000 &&
        bounds.y >= -1_000_000 &&
        bounds.x + bounds.width <= 1_000_000 &&
        bounds.y + bounds.height <= 1_000_000 &&
        transform.scaleX >= 0.001 &&
        transform.scaleX <= 1000 &&
        transform.scaleY >= 0.001 &&
        transform.scaleY <= 1000,
      )
    },
    onResizeStart: () => {
      cancelled.current = false
      const editor = useEditor.getState()
      editor.commitDraft()
      const current = useEditor.getState()
      if (current.busy || current.editingId || usePresentation.getState().playing) return
      session.current = {
        stroke,
        bounds: projectedInkBounds(
          stroke,
          getSpatialView(current.workbook.id, current.activeSheetId),
        ),
        view: getSpatialView(current.workbook.id, current.activeSheetId),
        workbookId: current.workbook.id,
        document: current.history.document,
        sheetId: current.activeSheetId,
      }
    },
    onResizeEnd: (_event, bounds) => {
      const active = session.current
      session.current = null
      if (!active || cancelled.current) return
      const editor = useEditor.getState()
      if (
        editor.workbook.id !== active.workbookId ||
        editor.activeSheetId !== active.sheetId ||
        editor.history.document !== active.document ||
        getSpatialView(active.workbookId, active.sheetId) !== active.view
      )
        return
      const next = resizeSpatialInk(active.stroke, bounds, active.view)
      const rollback = (): void => {
        const current = useEditor.getState()
        if (
          current.workbook.id === active.workbookId &&
          current.activeSheetId === active.sheetId &&
          current.history.document === active.document
        )
          restore(active.bounds)
      }
      if (!editor.command({ type: 'upsertDrawing', stroke: next }, rollback)) rollback()
    },
  }
}
