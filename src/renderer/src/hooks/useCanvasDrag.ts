import { useEffect, useRef } from 'react'
import { useNodesState, type OnNodeDrag, type ReactFlowProps } from '@xyflow/react'
import { normalizeTopicSelection, type MindMapDocument } from '@core'
import { getSubtreeIds } from '@core/tree'
import type { TopicFlowNode } from '../components/TopicNode'
import { canvasDropCommand, findCanvasDrop, nodeCenter } from '../lib/canvasDrop'
import { projectCanvas } from '../components/documents/projectCanvas'
import { useEditor } from '../state/editor'
import { selectedTopicIds, setSelectedTopics, useSelectedIds } from '../state/selection'
import { usePresentation } from '../state/presentation'
import { beginCanvasDrag, clearCanvasDrag, updateCanvasDrag } from '../state/canvasInteraction'

interface DragSession {
  readonly token: symbol
  readonly sheetId: string
  readonly document: MindMapDocument
  readonly roots: string[]
  readonly excluded: Set<string>
  readonly origins: Map<string, { x: number; y: number }>
  readonly anchorId: string
}

/** Preserve dimensions measured by React Flow while only selection/position changes. */
function preserveMeasurement(
  node: TopicFlowNode,
  previous: TopicFlowNode | undefined,
): TopicFlowNode {
  return previous?.measured &&
    node.style?.width === previous.style?.width &&
    node.style?.height === previous.style?.height
    ? { ...node, measured: previous.measured }
    : node
}

/** React Flow owns pointer/box selection; document commands are submitted only at gesture end. */
export function useCanvasDrag(projectedNodes: TopicFlowNode[]) {
  const selectedIds = useSelectedIds()
  const playing = usePresentation((state) => state.playing)
  const primaryId = useEditor((state) => state.selectedId)
  const [nodes, setNodes, onNodesChange] = useNodesState<TopicFlowNode>(projectedNodes)
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
      setNodes((previous) => {
        const measured = new Map(previous.map((node) => [node.id, node]))
        return projectCanvas(editor.history.document).nodes.map((node) => ({
          ...preserveMeasurement(node, measured.get(node.id)),
          selected: selected.has(node.id),
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
    const ids = new Set(selectedIds.length ? selectedIds : [primaryId])
    setNodes((previous) => {
      const dragging = new Map(previous.map((node) => [node.id, node]))
      return projectedNodes.map((node) => ({
        ...preserveMeasurement(node, dragging.get(node.id)),
        ...(session.current?.excluded.has(node.id)
          ? { position: dragging.get(node.id)?.position ?? node.position }
          : {}),
        selected: ids.has(node.id),
        draggable: node.draggable !== false && !playing,
      }))
    })
  }, [projectedNodes, selectedIds, primaryId, playing, setNodes])

  const onDragStart: OnNodeDrag<TopicFlowNode> = (_event, dragged, draggedNodes) => {
    cancelled.current = false
    if (usePresentation.getState().playing) return
    const editor = useEditor.getState()
    editor.commitDraft()
    const current = useEditor.getState()
    if (current.editingId || current.busy) return
    const document = current.history.document
    const selected = selectedTopicIds(current)
    const ids = selected.includes(dragged.id)
      ? selected
      : draggedNodes.length > 1
        ? draggedNodes.map((node) => node.id)
        : [dragged.id]
    const roots = normalizeTopicSelection(
      document,
      ids.filter((id) => id !== document.rootId),
    )
    if (!roots.length) return
    const excluded = new Set(roots.flatMap((id) => getSubtreeIds(document, id)))
    session.current = {
      token: beginCanvasDrag(document, current.activeSheetId, roots),
      sheetId: current.activeSheetId,
      document,
      roots,
      excluded,
      origins: new Map(projectedNodes.map((node) => [node.id, { ...node.position }])),
      anchorId: dragged.id,
    }
    setSelectedTopics(ids)
  }
  const onDrag: OnNodeDrag<TopicFlowNode> = (_event, dragged) => {
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
    const drop = findCanvasDrop(
      active.document,
      projectedNodes,
      active.excluded,
      nodeCenter(dragged),
    )
    updateCanvasDrag(active.token, drop)
    const dropTargetId = drop?.targetId ?? null
    if (dropTargetId !== useEditor.getState().dropTargetId) useEditor.setState({ dropTargetId })
  }
  const onDragStop: OnNodeDrag<TopicFlowNode> = (_event, dragged, draggedNodes) => {
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
      const drop = findCanvasDrop(
        active.document,
        projectedNodes,
        active.excluded,
        nodeCenter(anchor),
      )
      const command = canvasDropCommand(
        active.document,
        active.roots,
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
    // Read the resulting document; a stale projection would briefly reset a completed drop.
    setNodes((previous) => {
      const measured = new Map(previous.map((node) => [node.id, node]))
      return projectCanvas(current.history.document).nodes.map((node) => ({
        ...preserveMeasurement(node, measured.get(node.id)),
        selected: selected.has(node.id),
      }))
    })
  }
  const selectionDrag: Pick<
    ReactFlowProps<TopicFlowNode>,
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
