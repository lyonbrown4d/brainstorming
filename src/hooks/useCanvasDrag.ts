import type { MindMapLayout } from '@layout'
import { spatialCameraDelta } from '@renderer/lib/spatialCamera'
import { previewPerspectiveDrag } from '@renderer/lib/canvasPerspectiveDrag'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMemoizedFn } from 'ahooks'
import { useReactFlow, type OnNodeDrag } from '@xyflow/react'
import { useCanvasNodeState } from '@renderer/hooks/useCanvasNodeState'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { DragSession } from '@renderer/lib/canvasGestureSession'
import { preserveMeasurement, synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'
import {
  canvasTopicRoots,
  canvasDescendants,
  canvasMoveCommand,
  canvasSelection,
} from '@renderer/lib/canvasGesture'
import { createCanvasDropFinder } from '@renderer/lib/canvasDropIndex'
import { canvasDragLayers } from '@renderer/lib/canvasDragLayers'
import { canvasDragPointer } from '@renderer/lib/canvasDragPointer'
import { canvasDragSelection } from '@renderer/lib/canvasDragSelection'
import { captureSpatialOrigins, type SpatialDepths } from '@renderer/lib/spatialProjection'
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
  projectedNodes: CanvasFlowNode[],
  canvasId: string,
  spatialDepths?: SpatialDepths,
  interactionReady = true,
  nativeLayout?: MindMapLayout,
) => {
  const workbookId = useEditor((state) => state.workbook.id)
  const scopeId = JSON.stringify([workbookId, canvasId])
  const { screenToFlowPosition, getNodes } = useReactFlow<CanvasFlowNode>()
  const [dragging, setDragging] = useState<ReadonlySet<string> | undefined>(undefined)
  const { nodes, setNodes, onNodesChange } = useCanvasNodeState(projectedNodes, scopeId, dragging)
  const session = useRef<DragSession | null>(null)
  const findDrop = useRef<ReturnType<typeof createCanvasDropFinder> | null>(null)
  const dragDepths = useRef<ReadonlyMap<string, number>>(new Map())
  const latestProjected = useRef(projectedNodes)
  const cancelled = useRef(false)
  useEffect(() => {
    const cancel = () => {
      const active = session.current
      if (!active) return
      session.current = null
      findDrop.current = null
      setDragging(undefined)
      dragDepths.current = new Map()
      cancelled.current = true
      clearCanvasDrag(active.token)
      useEditor.setState({ dropTargetId: null })
      const editor = useEditor.getState()
      const selected = new Set(selectedTopicIds(editor))
      const drawings = new Set(selectedDrawingIds(editor))
      const projected = latestProjected.current
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
  }, [setNodes])
  useEffect(() => {
    latestProjected.current = projectedNodes
  }, [projectedNodes])

  const onDragStart = useMemoizedFn<OnNodeDrag<CanvasFlowNode>>((_event, dragged, draggedNodes) => {
    cancelled.current = false
    if (!interactionReady || usePresentation.getState().playing) return
    const editor = useEditor.getState()
    editor.commitDraft()
    const current = useEditor.getState()
    if (current.editingId || current.busy) return
    const document = current.history.document
    const topics = new Set(selectedTopicIds(current))
    const drawings = new Set(selectedDrawingIds(current))
    const selected = projectedNodes.filter((node) =>
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
    if (view.mode === '3d' && (!spatialDepths || !nativeLayout)) return
    const currentNodes = getNodes()
    const { origins, nativeOrigins } = captureSpatialOrigins(
      document,
      view,
      currentNodes,
      spatialDepths,
      nativeLayout,
    )
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
    findDrop.current = session.current.canDrop
      ? createCanvasDropFinder(document, currentNodes, excluded)
      : null
    setDragging(excluded)
    setNodes((current) => canvasDragLayers(current, excluded))
    dragDepths.current = new Map(currentNodes.map((node) => [node.id, node.data.cameraDepth ?? 0]))
    setCanvasSelection(ids.topics, ids.drawings)
  })
  const onDrag = useMemoizedFn<OnNodeDrag<CanvasFlowNode>>((event) => {
    const active = session.current
    if (!active) return
    const pointer = canvasDragPointer(event)
    const drop =
      active.canDrop && pointer ? findDrop.current?.(screenToFlowPosition(pointer)) : undefined
    updateCanvasDrag(active.token, drop)
    const dropTargetId = drop?.targetId ?? null
    if (dropTargetId !== useEditor.getState().dropTargetId) useEditor.setState({ dropTargetId })
  })
  const onDragStop = useMemoizedFn<OnNodeDrag<CanvasFlowNode>>((event, dragged, draggedNodes) => {
    cancelled.current = false
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
      const pointer = canvasDragPointer(event)
      const drop =
        active.canDrop && pointer ? findDrop.current?.(screenToFlowPosition(pointer)) : undefined
      const command = canvasMoveCommand(
        active.document,
        active.roots,
        active.drawings,
        active.nativeOrigins,
        spatialCameraDelta(
          active.view,
          {
            x: anchor.position.x - origin.x,
            y: anchor.position.y - origin.y,
          },
          dragDepths.current.get(anchor.id) ?? 0,
        ),
        drop,
      )
      if (command) {
        const restore = () => {
          const current = useEditor.getState()
          if (
            current.workbook.id !== active.workbookId ||
            current.activeSheetId !== active.sheetId ||
            session.current
          )
            return
          const topics = new Set(selectedTopicIds(current))
          const drawings = new Set(selectedDrawingIds(current))
          const projected = latestProjected.current
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
    findDrop.current = null
    useEditor.setState({ dropTargetId: null })
    dragDepths.current = new Map()
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
    const accepted = cancelled.current
      ? changes.filter((change) => change.type !== 'position')
      : changes
    const active = session.current
    const anchor =
      active &&
      accepted.find((change) => change.type === 'position' && change.id === active.anchorId)
    const origin = active?.origins.get(active.anchorId)
    // Apply RF's positions and the subtree preview atomically, rather than two state updates.
    const preview =
      active && origin && anchor?.type === 'position' && anchor.position
        ? {
            active,
            depths: dragDepths.current,
            dx: anchor.position.x - origin.x,
            dy: anchor.position.y - origin.y,
          }
        : null
    onNodesChange(
      accepted,
      preview
        ? (current) =>
            previewPerspectiveDrag(current, preview.active, preview.depths, preview.dx, preview.dy)
        : undefined,
    )
  })
  const selectionHandlers = useMemo(
    () => canvasDragSelection(onDragStart, onDrag, onDragStop),
    [onDragStart, onDrag, onDragStop],
  )
  return {
    nodes,
    onNodesChange: handleNodesChange,
    onNodeDragStart: onDragStart,
    onNodeDrag: onDrag,
    onNodeDragStop: onDragStop,
    ...selectionHandlers,
  }
}
