import { canvasDragPreview } from '@renderer/lib/canvasDragPreview'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMemoizedFn } from 'ahooks'
import { useReactFlow, type OnNodeDrag } from '@xyflow/react'
import { useCanvasPositionFrames } from '@renderer/hooks/useCanvasPositionFrames'
import { useCanvasNodeState } from '@renderer/hooks/useCanvasNodeState'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { CanvasProjectionController } from '@renderer/lib/canvasProjectionController'
import type { DragSession } from '@renderer/lib/canvasGestureSession'
import { preserveMeasurement, synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'
import {
  canvasTopicRoots,
  canvasDescendants,
  canvasMoveCommand,
  canvasSelection,
} from '@renderer/lib/canvasGesture'
import { useCanvasDropFinder } from '@renderer/hooks/useCanvasDropFinder'
import { canvasDragLayers } from '@renderer/lib/canvasDragLayers'
import { canvasDragSelection } from '@renderer/lib/canvasDragSelection'
import { useEditor } from '@renderer/state/editor'
import { getSpatialView, useSpatialView } from '@renderer/state/spatialView'
import { selectedTopicIds, selectedDrawingIds, setCanvasSelection } from '@renderer/state/selection'
import { usePresentation } from '@renderer/state/presentation'
import {
  beginCanvasDrag,
  clearCanvasDrag,
  updateCanvasDrag,
} from '@renderer/state/canvasInteraction'

/** React Flow owns pointer/box selection; document commands are submitted only at gesture end. */
export const useCanvasDrag = (
  projection: CanvasProjectionController,
  canvasId: string,
  interactionReady = true,
) => {
  const workbookId = useEditor((state) => state.workbook.id)
  const scopeId = JSON.stringify([workbookId, canvasId])
  const { getNodes } = useReactFlow<CanvasFlowNode>()
  const [dragging, setDragging] = useState<ReadonlySet<string> | undefined>(undefined)
  const { setNodes, onNodesChange } = useCanvasNodeState(projection, scopeId, dragging)
  const session = useRef<DragSession | null>(null)
  const dropFinder = useCanvasDropFinder()
  const cancelled = useRef(false)
  const applyNodesChange = useMemoizedFn((changes: Parameters<typeof onNodesChange>[0]) => {
    const accepted = cancelled.current
      ? changes.filter((change) => change.type !== 'position')
      : changes
    // Apply RF's positions and the subtree preview atomically in one display frame.
    onNodesChange(accepted, canvasDragPreview(accepted, session.current))
  })
  const {
    request: requestPositionFrame,
    flush: flushPositionFrame,
    clear: clearPositionFrame,
  } = useCanvasPositionFrames(applyNodesChange)
  useEffect(() => {
    const cancel = () => {
      const active = session.current
      if (!active) return
      clearPositionFrame()
      session.current = null
      dropFinder.clear()
      setDragging(undefined)
      cancelled.current = true
      clearCanvasDrag(active.token)
      useEditor.setState({ dropTargetId: null })
      const editor = useEditor.getState()
      if (
        editor.workbook.id !== active.workbookId ||
        editor.activeSheetId !== active.sheetId ||
        editor.history.document !== active.document
      )
        return
      const selected = new Set(selectedTopicIds(editor))
      const drawings = new Set(selectedDrawingIds(editor))
      const projected = projection.getProjection().nodes
      setNodes((previous) => {
        const measured = new Map(previous.map((node) => [node.id, node]))
        return projected.map((node) => ({
          ...preserveMeasurement(node, measured.get(node.id)),
          selected: node.type === 'ink' ? drawings.has(node.data.stroke.id) : selected.has(node.id),
        }))
      })
    }
    const validate = () => {
      const active = session.current
      const editor = useEditor.getState()
      if (
        active &&
        (editor.workbook.id !== active.workbookId ||
          editor.activeSheetId !== active.sheetId ||
          editor.history.document !== active.document ||
          getSpatialView(active.workbookId, active.sheetId) !== active.view ||
          usePresentation.getState().playing)
      )
        cancel()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || !session.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancel()
    }
    const unsubscribe = useEditor.subscribe(validate)
    const unsubscribeView = useSpatialView.subscribe(validate)
    const unsubscribePresentation = usePresentation.subscribe(validate)
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', cancel)
    return () => {
      cancel()
      unsubscribe()
      unsubscribeView()
      unsubscribePresentation()
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', cancel)
    }
  }, [setNodes, dropFinder, clearPositionFrame, projection])

  const onDragStart = useMemoizedFn<OnNodeDrag<CanvasFlowNode>>((_event, dragged, draggedNodes) => {
    clearPositionFrame()
    cancelled.current = false
    if (!interactionReady || usePresentation.getState().playing) return
    const editor = useEditor.getState()
    editor.commitDraft()
    const current = useEditor.getState()
    if (
      current.editingId ||
      current.busy ||
      projection.getState().document !== current.history.document
    )
      return
    const document = current.history.document
    const topics = new Set(selectedTopicIds(current))
    const drawings = new Set(selectedDrawingIds(current))
    const selected = projection
      .getProjection()
      .nodes.filter((node) =>
        node.type === 'ink' ? drawings.has(node.data.stroke.id) : topics.has(node.id),
      )
    const moving = selected.some((node) => node.id === dragged.id)
      ? selected
      : draggedNodes.length > 1
        ? draggedNodes
        : [dragged]
    const ids = canvasSelection(moving)
    const roots = canvasTopicRoots(document, ids.topics)
    if (!roots.length && !ids.drawings.length) return
    const excluded = new Set([
      ...canvasDescendants(document, roots),
      ...moving.filter((node) => node.type === 'ink').map((node) => node.id),
    ])
    const view = getSpatialView(current.workbook.id, current.activeSheetId)
    const currentNodes = getNodes()
    const origins = new Map(currentNodes.map((node) => [node.id, node.position]))
    const nativeOrigins = origins
    session.current = {
      token: beginCanvasDrag(document, current.activeSheetId, roots, ids.drawings.length),
      workbookId: current.workbook.id,
      sheetId: current.activeSheetId,
      document,
      roots,
      drawings: ids.drawings,
      canDrop: !ids.drawings.length && !roots.includes(document.rootId),
      excluded,
      origins,
      nativeOrigins,
      view,
      anchorId: dragged.id,
    }
    dropFinder.clear()
    if (session.current.canDrop) dropFinder.start(document, currentNodes, excluded)
    setDragging(excluded)
    setNodes((current) => canvasDragLayers(current, excluded))
    setCanvasSelection(ids.topics, ids.drawings)
  })
  const onDrag = useMemoizedFn<OnNodeDrag<CanvasFlowNode>>((event, dragged) => {
    const active = session.current
    if (!active) return
    const drop = active.canDrop ? dropFinder.find(event, dragged) : undefined
    updateCanvasDrag(active.token, drop)
    const dropTargetId = drop?.targetId ?? null
    if (dropTargetId !== useEditor.getState().dropTargetId) useEditor.setState({ dropTargetId })
  })
  const onDragStop = useMemoizedFn<OnNodeDrag<CanvasFlowNode>>((event, dragged, draggedNodes) => {
    cancelled.current = false
    flushPositionFrame()
    const active = session.current
    session.current = null
    setDragging(undefined)
    if (!active) return
    clearCanvasDrag(active.token)
    const editor = useEditor.getState()
    const anchor = draggedNodes.find((node) => node.id === active.anchorId) ?? dragged
    const origin = active.origins.get(anchor.id)
    if (
      origin &&
      editor.workbook.id === active.workbookId &&
      editor.activeSheetId === active.sheetId &&
      editor.history.document === active.document &&
      getSpatialView(active.workbookId, active.sheetId) === active.view &&
      !usePresentation.getState().playing
    ) {
      const drop = active.canDrop ? dropFinder.find(event, anchor) : undefined
      const command = canvasMoveCommand(
        active.document,
        active.roots,
        active.drawings,
        active.nativeOrigins,
        { x: anchor.position.x - origin.x, y: anchor.position.y - origin.y },
        drop,
      )
      if (command) {
        const restore = () => {
          const current = useEditor.getState()
          if (
            current.workbook.id !== active.workbookId ||
            current.activeSheetId !== active.sheetId ||
            current.history.document.id !== active.document.id ||
            session.current
          )
            return
          const topics = new Set(selectedTopicIds(current))
          const drawings = new Set(selectedDrawingIds(current))
          const projected = projection.getProjection().nodes
          setNodes((previous) =>
            synchronizeCanvasNodes(previous, projected, {
              geometryChanged: true,
              dragging: undefined,
              topics,
              drawings,
              playing: usePresentation.getState().playing,
            }),
          )
        }
        if (!editor.command(command, restore)) restore()
      }
    }
    dropFinder.clear()
    useEditor.setState({ dropTargetId: null })
    const current = useEditor.getState()
    const selected = new Set(selectedTopicIds(current))
    const drawings = new Set(selectedDrawingIds(current))
    // Keep the pointer's final position until the matching native layout resolves.
    setNodes((previous) =>
      canvasDragLayers(previous).map((node) => ({
        ...node,
        selected: node.type === 'ink' ? drawings.has(node.data.stroke.id) : selected.has(node.id),
      })),
    )
  })
  const handleNodesChange = useMemoizedFn((changes: Parameters<typeof onNodesChange>[0]) => {
    if (
      session.current &&
      changes.length &&
      changes.every((change) => change.type === 'position' && change.dragging === true)
    ) {
      requestPositionFrame(changes.filter((change) => change.type === 'position'))
    } else {
      flushPositionFrame()
      applyNodesChange(changes)
    }
  })
  const selectionHandlers = useMemo(
    () => canvasDragSelection(onDragStart, onDrag, onDragStop),
    [onDragStart, onDrag, onDragStop],
  )
  return {
    onNodesChange: handleNodesChange,
    onNodeDragStart: onDragStart,
    onNodeDrag: onDrag,
    onNodeDragStop: onDragStop,
    ...selectionHandlers,
  }
}
