import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ReactFlow, useNodesState, useReactFlow, type OnNodeDrag } from '@xyflow/react'
import {
  createFloatingAt,
  interactAnnotationTopic,
  useAnnotationInteraction,
} from '../state/annotationInteraction'
import { RelationEdge } from './annotations/RelationEdge'
import { presentationDocument, usePresentation } from '../state/presentation'
import { useEditor } from '../state/editor'
import {
  selectedTopicIds,
  selectTopic,
  setSelectedTopics,
  useSelectedIds,
} from '../state/selection'
import { TopicNode, type TopicFlowNode } from './TopicNode'
import { CanvasAnnotations } from './annotations/CanvasAnnotations'
import { SelectionVisibility } from './SelectionVisibility'
import { PresentationPlayback } from './documents/PresentationControls'
import { FloatingToolbar } from './FloatingToolbar'
import { documentAppearance } from '@shared/appearance'
import { projectCanvas } from './documents/projectCanvas'
import { StructureEdge, StructureGeometry } from './documents/StructureGeometry'
const nodeTypes = { topic: TopicNode }
const edgeTypes = { relation: RelationEdge, structure: StructureEdge }
export { ZoomControls } from './ZoomControls'
export function Canvas() {
  const flow = useReactFlow<TopicFlowNode>()
  const reduceMotion = useReducedMotion()
  const document = useEditor((state) => state.history.document)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const selectedIds = useSelectedIds()
  const primaryId = useEditor((state) => state.selectedId)
  const [savedView] = useState(() => useEditor.getState().views[activeSheetId])
  const presentation = usePresentation()
  const presentedId =
    presentation.playing && presentation.sheetId === activeSheetId
      ? document.presentation?.[presentation.index]?.topicId
      : undefined
  const projection = useMemo(
    () => projectCanvas(presentationDocument(document, presentedId)),
    [document, presentedId],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState<TopicFlowNode>(projection.nodes)
  useEffect(() => {
    const ids = new Set(selectedIds.length ? selectedIds : [primaryId])
    setNodes(projection.nodes.map((node) => ({ ...node, selected: ids.has(node.id) })))
  }, [projection.nodes, selectedIds, primaryId, setNodes])
  const excluded = useRef(new Set<string>())
  const lastDragCheck = useRef(0)
  const findTarget = useCallback(
    (dragged: TopicFlowNode): TopicFlowNode | undefined => {
      const center = {
        x: dragged.position.x + (dragged.width ?? 160) / 2,
        y: dragged.position.y + (dragged.height ?? 48) / 2,
      }
      let target: TopicFlowNode | undefined
      let distance = 125
      for (const candidate of projection.nodes) {
        if (excluded.current.has(candidate.id)) continue
        const next = Math.hypot(
          center.x - candidate.position.x - Number(candidate.style?.width ?? 160) / 2,
          center.y - candidate.position.y - Number(candidate.style?.height ?? 48) / 2,
        )
        if (next < distance) {
          target = candidate
          distance = next
        }
      }
      return target
    },
    [projection.nodes],
  )
  const onDragStart: OnNodeDrag<TopicFlowNode> = (_event, dragged) => {
    useEditor.getState().commitDraft()
    const current = useEditor.getState().history.document
    const stack = selectedTopicIds(useEditor.getState()).includes(dragged.id)
      ? [...selectedTopicIds(useEditor.getState())]
      : [dragged.id]
    excluded.current = new Set()
    while (stack.length > 0) {
      const id = stack.pop()
      if (!id) continue
      excluded.current.add(id)
      stack.push(...(current.topics[id]?.children ?? []))
    }
  }
  const onDrag: OnNodeDrag<TopicFlowNode> = (_event, dragged) => {
    if (performance.now() - lastDragCheck.current < 65) return
    lastDragCheck.current = performance.now()
    const dropTargetId = findTarget(dragged)?.id ?? null
    if (dropTargetId !== useEditor.getState().dropTargetId) useEditor.setState({ dropTargetId })
  }
  const onDragStop: OnNodeDrag<TopicFlowNode> = (_event, dragged) => {
    const target = findTarget(dragged)
    if (document.floatingIds?.includes(dragged.id)) {
      useEditor.getState().command({
        type: 'setFloatingPosition',
        topicId: dragged.id,
        x: dragged.position.x,
        y: dragged.position.y,
      })
    } else if (target)
      useEditor.getState().command({
        type: 'moveTopics',
        topicIds: selectedTopicIds(useEditor.getState()).includes(dragged.id)
          ? selectedTopicIds(useEditor.getState())
          : [dragged.id],
        parentId: target.id,
        side:
          target.id === document.rootId
            ? dragged.position.x < target.position.x
              ? 'left'
              : 'right'
            : target.data.topic.side,
      })
    useEditor.setState({ dropTargetId: null })
    const ids = new Set(selectedTopicIds(useEditor.getState()))
    setNodes(projection.nodes.map((node) => ({ ...node, selected: ids.has(node.id) })))
  }
  return (
    <motion.section
      className="canvas"
      style={{
        backgroundColor: documentAppearance(document).background,
        fontFamily: documentAppearance(document).fontFamily,
      }}
      id="sheet-panel"
      role="tabpanel"
      aria-label="当前画布"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.12 }}
    >
      <ReactFlow<TopicFlowNode>
        key={document.id}
        nodes={nodes}
        edges={projection.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(event, node) => {
          if (interactAnnotationTopic(node.id)) return
          useAnnotationInteraction.setState({ selected: null, editing: false })
          selectTopic(node.id, event.metaKey || event.ctrlKey || event.shiftKey)
          window.document
            .querySelector<HTMLElement>(`.topic-input[data-topic-id="${CSS.escape(node.id)}"]`)
            ?.focus({ preventScroll: true })
        }}
        onSelectionEnd={() => {
          setSelectedTopics(
            flow
              .getNodes()
              .filter((node) => node.selected)
              .map((node) => node.id),
          )
        }}
        onNodeDragStart={onDragStart}
        onNodeDrag={onDrag}
        onNodeDragStop={onDragStop}
        onPaneClick={(event) => {
          const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          if (createFloatingAt(point.x, point.y)) return
          useEditor.getState().commitDraft()
          const id = useEditor.getState().selectedId
          useEditor.getState().select(id)
          window.document
            .querySelector<HTMLElement>(`.topic-input[data-topic-id="${CSS.escape(id)}"]`)
            ?.focus({ preventScroll: true })
        }}
        onlyRenderVisibleElements
        defaultViewport={savedView ?? { x: 0, y: 0, zoom: 1 }}
        fitView={!savedView}
        onMove={(_event, viewport) => {
          if (useEditor.getState().activeSheetId === activeSheetId)
            useEditor.setState((state) => ({
              views: { ...state.views, [activeSheetId]: viewport },
            }))
        }}
        fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }}
        minZoom={0.15}
        maxZoom={2}
        deleteKeyCode={null}
        nodesConnectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Control']}
        panOnScroll
        zoomOnDoubleClick={false}
      >
        <StructureGeometry document={document} decorations={projection.decorations} />
        <CanvasAnnotations document={document} nodes={projection.layoutNodes} />
        <SelectionVisibility />
      </ReactFlow>
      <FloatingToolbar />
      <PresentationPlayback />
    </motion.section>
  )
}
