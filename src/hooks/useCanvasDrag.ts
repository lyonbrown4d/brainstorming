import { useEffect, useRef, useState } from 'react'
import { useNodesState, useReactFlow, type OnNodeDrag } from '@xyflow/react'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { DragSession } from '@renderer/lib/canvasGestureSession'
import { preserveMeasurement, synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'
import {
  canvasTopicRoots,
  canvasDescendants,
  canvasMoveCommand,
  canvasSelection,
} from '@renderer/lib/canvasGesture'
import { findCanvasDrop } from '@renderer/lib/canvasDrop'
import { canvasDragPointer } from '@renderer/lib/canvasDragPointer'
import { canvasDragSelection } from '@renderer/lib/canvasDragSelection'
import { captureSpatialOrigins, type SpatialDepths } from '@renderer/lib/spatialProjection'
import { useEditor } from '@renderer/state/editor'
import { getSpatialView, useSpatialView } from '@renderer/state/spatialView'
import {
  selectedTopicIds,
  selectedDrawingIds,
  setCanvasSelection,
  useSelectedDrawingIds,
  useSelectedIds,
} from '@renderer/state/selection'
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
) => {
  const workbookId = useEditor((state) => state.workbook.id)
  const scopeId = JSON.stringify([workbookId, canvasId])
  const { screenToFlowPosition, getNodes } = useReactFlow<CanvasFlowNode>()
  const selectedIds = useSelectedIds()
  const drawingIds = useSelectedDrawingIds()
  const playing = usePresentation((state) => state.playing)
  const primaryId = useEditor((state) => state.selectedId)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasFlowNode>(projectedNodes)
  const [nodesScope, setNodesScope] = useState(scopeId)
  useEffect(() => {
    if (nodesScope === scopeId) return
    setNodes(projectedNodes)
    setNodesScope(scopeId)
  }, [nodesScope, projectedNodes, scopeId, setNodes])
  const session = useRef<DragSession | null>(null)
  const latestProjected = useRef(projectedNodes)
  const cancelled = useRef(false)
  useEffect(() => {
    const cancel = () => {
      const active = session.current
      if (!active) return
      session.current = null
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
    const ids = new Set(selectedTopicIds(useEditor.getState()))
    const drawings = new Set(drawingIds)
    const geometryChanged = latestProjected.current !== projectedNodes
    latestProjected.current = projectedNodes
    const dragging = session.current?.excluded
    setNodes((previous) =>
      synchronizeCanvasNodes(previous, projectedNodes, {
        geometryChanged,
        dragging,
        topics: ids,
        drawings,
        playing,
      }),
    )
  }, [projectedNodes, selectedIds, drawingIds, primaryId, playing, setNodes])

  const onDragStart: OnNodeDrag<CanvasFlowNode> = (_event, dragged, draggedNodes) => {
    cancelled.current = false
    if (!interactionReady || usePresentation.getState().playing) return
    const editor = useEditor.getState()
    editor.commitDraft()
    const current = useEditor.getState()
    if (current.editingId || current.busy) return
    const document = current.history.document
    const topics = selectedTopicIds(current)
    const drawings = selectedDrawingIds(current)
    const selected = projectedNodes.filter((node) =>
      node.type === 'ink' ? drawings.includes(node.data.stroke.id) : topics.includes(node.id),
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
    if (view.mode === '3d' && !spatialDepths) return
    const { origins, nativeOrigins } = captureSpatialOrigins(
      document,
      view,
      getNodes(),
      spatialDepths,
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
    setCanvasSelection(ids.topics, ids.drawings)
  }
  const onDrag: OnNodeDrag<CanvasFlowNode> = (event, dragged) => {
    const active = session.current
    const origin = active?.origins.get(dragged.id)
    if (!active || !origin) return
    const dx = dragged.position.x - origin.x
    const dy = dragged.position.y - origin.y
    // Move visible descendants with their selected subtree instead of stretching its children.
    setNodes((current) =>
      current.map((node) => {
        const start = active.origins.get(node.id)
        return active.excluded.has(node.id) && start
          ? { ...node, position: { x: start.x + dx, y: start.y + dy } }
          : node
      }),
    )
    const pointer = canvasDragPointer(event)
    const drop =
      active.canDrop && pointer
        ? findCanvasDrop(
            active.document,
            projectedNodes.filter((node) => node.type !== 'ink'),
            active.excluded,
            screenToFlowPosition(pointer),
          )
        : undefined
    updateCanvasDrag(active.token, drop)
    const dropTargetId = drop?.targetId ?? null
    if (dropTargetId !== useEditor.getState().dropTargetId) useEditor.setState({ dropTargetId })
  }
  const onDragStop: OnNodeDrag<CanvasFlowNode> = (event, dragged, draggedNodes) => {
    cancelled.current = false
    const active = session.current
    session.current = null
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
        active.canDrop && pointer
          ? findCanvasDrop(
              active.document,
              projectedNodes.filter((node) => node.type !== 'ink'),
              active.excluded,
              screenToFlowPosition(pointer),
            )
          : undefined
      const command = canvasMoveCommand(
        active.document,
        active.roots,
        active.drawings,
        active.nativeOrigins,
        {
          x: anchor.position.x - origin.x,
          y: anchor.position.y - origin.y,
        },
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
    useEditor.setState({ dropTargetId: null })
    const current = useEditor.getState()
    const selected = new Set(selectedTopicIds(current))
    const drawings = new Set(selectedDrawingIds(current))
    // Keep the pointer's final position until the matching native layout resolves.
    setNodes((previous) =>
      previous.map((node) => ({
        ...node,
        selected: node.type === 'ink' ? drawings.has(node.data.stroke.id) : selected.has(node.id),
      })),
    )
  }
  return {
    nodes: nodesScope === scopeId ? nodes : projectedNodes,
    onNodesChange: (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(
        cancelled.current ? changes.filter((change) => change.type !== 'position') : changes,
      )
    },
    onNodeDragStart: onDragStart,
    onNodeDrag: onDrag,
    onNodeDragStop: onDragStop,
    ...canvasDragSelection(onDragStart, onDrag, onDragStop),
  }
}
