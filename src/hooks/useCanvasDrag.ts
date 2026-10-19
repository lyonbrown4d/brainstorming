import { useEffect, useRef } from 'react'
import { useNodesState, type OnNodeDrag, type ReactFlowProps } from '@xyflow/react'
import { type MindMapDocument } from '@core'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import {
  canvasTopicRoots,
  canvasDescendants,
  canvasMoveCommand,
  canvasSelection,
} from '@renderer/lib/canvasGesture'
import { findCanvasDrop, nodeCenter } from '@renderer/lib/canvasDrop'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { useEditor } from '@renderer/state/editor'
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

interface DragSession {
  readonly token: symbol
  readonly sheetId: string
  readonly document: MindMapDocument
  readonly roots: string[]
  readonly drawings: string[]
  readonly canDrop: boolean
  readonly excluded: Set<string>
  readonly origins: Map<string, { x: number; y: number }>
  readonly anchorId: string
}

/** Preserve dimensions measured by React Flow while only selection/position changes. */
const preserveMeasurement = (
  node: CanvasFlowNode,
  previous: CanvasFlowNode | undefined,
): CanvasFlowNode => {
  return previous?.measured &&
    node.style?.width === previous.style?.width &&
    node.style?.height === previous.style?.height
    ? { ...node, measured: previous.measured }
    : node
}

/** React Flow owns pointer/box selection; document commands are submitted only at gesture end. */
export const useCanvasDrag = (projectedNodes: CanvasFlowNode[]) => {
  const selectedIds = useSelectedIds()
  const drawingIds = useSelectedDrawingIds()
  const playing = usePresentation((state) => state.playing)
  const primaryId = useEditor((state) => state.selectedId)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasFlowNode>(projectedNodes)
  const session = useRef<DragSession | null>(null)
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
      setNodes((previous) => {
        const measured = new Map(previous.map((node) => [node.id, node]))
        return projectCanvas(editor.history.document).nodes.map((node) => ({
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
        (editor.activeSheetId !== active.sheetId ||
          editor.history.document !== active.document ||
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
    const unsubscribePresentation = usePresentation.subscribe(validate)
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', cancel)
    return () => {
      cancel()
      unsubscribe()
      unsubscribePresentation()
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', cancel)
    }
  }, [setNodes])
  useEffect(() => {
    const ids = new Set(selectedTopicIds(useEditor.getState()))
    const drawings = new Set(drawingIds)
    setNodes((previous) => {
      const dragging = new Map(previous.map((node) => [node.id, node]))
      let changed = previous.length !== projectedNodes.length
      const next = projectedNodes.map((node) => {
        const old = dragging.get(node.id)
        const measured = preserveMeasurement(node, old)
        const position = session.current?.excluded.has(node.id)
          ? (old?.position ?? node.position)
          : node.position
        const selected = node.type === 'ink' ? drawings.has(node.data.stroke.id) : ids.has(node.id)
        const draggable = node.draggable !== false && !playing
        if (
          old?.data === node.data &&
          old.style === node.style &&
          old.position.x === position.x &&
          old.position.y === position.y &&
          old.selected === selected &&
          old.draggable === draggable
        )
          return old
        changed = true
        return { ...measured, position, selected, draggable }
      })
      return changed ? next : previous
    })
  }, [projectedNodes, selectedIds, drawingIds, primaryId, playing, setNodes])

  const onDragStart: OnNodeDrag<CanvasFlowNode> = (_event, dragged, draggedNodes) => {
    cancelled.current = false
    if (usePresentation.getState().playing) return
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
    session.current = {
      token: beginCanvasDrag(document, current.activeSheetId, roots, ids.drawings.length),
      sheetId: current.activeSheetId,
      document,
      roots,
      drawings: ids.drawings,
      canDrop: !ids.drawings.length && !roots.includes(document.rootId),
      excluded,
      origins: new Map(projectedNodes.map((node) => [node.id, { ...node.position }])),
      anchorId: dragged.id,
    }
    setCanvasSelection(ids.topics, ids.drawings)
  }
  const onDrag: OnNodeDrag<CanvasFlowNode> = (_event, dragged) => {
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
    const drop = active.canDrop
      ? findCanvasDrop(
          active.document,
          projectedNodes.filter((node) => node.type !== 'ink'),
          active.excluded,
          nodeCenter(dragged),
        )
      : undefined
    updateCanvasDrag(active.token, drop)
    const dropTargetId = drop?.targetId ?? null
    if (dropTargetId !== useEditor.getState().dropTargetId) useEditor.setState({ dropTargetId })
  }
  const onDragStop: OnNodeDrag<CanvasFlowNode> = (_event, dragged, draggedNodes) => {
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
      editor.activeSheetId === active.sheetId &&
      editor.history.document === active.document &&
      !usePresentation.getState().playing
    ) {
      const drop = active.canDrop
        ? findCanvasDrop(
            active.document,
            projectedNodes.filter((node) => node.type !== 'ink'),
            active.excluded,
            nodeCenter(anchor),
          )
        : undefined
      const command = canvasMoveCommand(
        active.document,
        active.roots,
        active.drawings,
        active.origins,
        {
          x: anchor.position.x - origin.x,
          y: anchor.position.y - origin.y,
        },
        drop,
      )
      if (command) editor.command(command)
    }
    useEditor.setState({ dropTargetId: null })
    const current = useEditor.getState()
    const selected = new Set(selectedTopicIds(current))
    const drawings = new Set(selectedDrawingIds(current))
    // Read the resulting document; a stale projection would briefly reset a completed drop.
    setNodes((previous) => {
      const measured = new Map(previous.map((node) => [node.id, node]))
      return projectCanvas(current.history.document).nodes.map((node) => ({
        ...preserveMeasurement(node, measured.get(node.id)),
        selected: node.type === 'ink' ? drawings.has(node.data.stroke.id) : selected.has(node.id),
      }))
    })
  }
  const selectionDrag: Pick<
    ReactFlowProps<CanvasFlowNode>,
    'onSelectionDragStart' | 'onSelectionDrag' | 'onSelectionDragStop'
  > = {
    onSelectionDragStart: (event, group) => {
      if (group[0]) onDragStart(event.nativeEvent, group[0], group)
    },
    onSelectionDrag: (event, group) => {
      if (group[0]) onDrag(event.nativeEvent, group[0], group)
    },
    onSelectionDragStop: (event, group) => {
      if (group[0]) onDragStop(event.nativeEvent, group[0], group)
    },
  }
  return {
    nodes,
    onNodesChange: (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(
        cancelled.current ? changes.filter((change) => change.type !== 'position') : changes,
      )
    },
    onNodeDragStart: onDragStart,
    onNodeDrag: onDrag,
    onNodeDragStop: onDragStop,
    ...selectionDrag,
  }
}
