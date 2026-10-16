import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ReactFlow, useReactFlow } from '@xyflow/react'
import {
  createFloatingAt,
  interactAnnotationTopic,
  useAnnotationInteraction,
} from '../state/annotationInteraction'
import { useCanvasRelations } from '../hooks/useCanvasRelations'
import { canvasFitPadding } from '../hooks/useWorkbenchInsets'
import { CanvasOverlay } from './workbench/CanvasOverlay'
import { useCanvasViewport } from '../hooks/useCanvasViewport'
import { useCanvasDrag } from '../hooks/useCanvasDrag'
import { DragFeedback } from './workbench/DragFeedback'
import { CanvasMinimap } from './CanvasMinimap'
import { RelationEdge } from './annotations/RelationEdge'
import { presentationDocument, usePresentation } from '../state/presentation'
import { useEditor } from '../state/editor'
import { selectTopic, setSelectedTopics } from '../state/selection'
import { TopicNode, type TopicFlowNode } from './TopicNode'
import { CanvasAnnotations } from './annotations/CanvasAnnotations'
import { SelectionVisibility } from './SelectionVisibility'
import { FloatingToolbar } from './FloatingToolbar'
import { documentAppearance } from '@shared/appearance'
import { projectCanvas } from './documents/projectCanvas'
import { StructureEdge, StructureGeometry } from './documents/StructureGeometry'
const nodeTypes = { topic: TopicNode }
const edgeTypes = { relation: RelationEdge, structure: StructureEdge }
export { ZoomControls } from './ZoomControls'
export function Canvas() {
  const flow = useReactFlow<TopicFlowNode>()
  useCanvasViewport()
  const reduceMotion = useReducedMotion()
  const document = useEditor((state) => state.history.document)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const [savedView] = useState(() => useEditor.getState().views[activeSheetId])
  const [initialFit] = useState(() => ({ padding: canvasFitPadding(), maxZoom: 1.2 }))
  const presentation = usePresentation()
  const presentedId =
    presentation.playing && presentation.sheetId === activeSheetId
      ? presentation.steps[presentation.index]?.topicId
      : undefined
  const projection = useMemo(
    () => projectCanvas(presentationDocument(document, presentedId)),
    [document, presentedId],
  )
  const { reconnecting, ...relations } = useCanvasRelations(projection.edges)
  const drag = useCanvasDrag(projection.nodes)
  return (
    <motion.section
      className="canvas relative min-w-0 flex-1 [container-name:mindmap] [container-type:inline-size]"
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
        className={
          reconnecting
            ? '[&_.react-flow__handle]:!pointer-events-auto [&_.react-flow__handle]:!size-3 [&_.react-flow__handle]:!border-2 [&_.react-flow__handle]:!border-primary [&_.react-flow__handle]:!bg-background [&_.react-flow__handle]:!opacity-100'
            : ''
        }
        {...drag}
        {...relations}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(event, node) => {
          if (presentation.playing) return
          if (interactAnnotationTopic(node.id)) return
          useAnnotationInteraction.setState({ selected: null, editing: false })
          selectTopic(node.id, event.metaKey || event.ctrlKey || event.shiftKey)
          window.document
            .querySelector<HTMLElement>(`.topic-input[data-topic-id="${CSS.escape(node.id)}"]`)
            ?.focus({ preventScroll: true })
        }}
        onSelectionEnd={() => {
          if (presentation.playing) return
          setSelectedTopics(
            flow
              .getNodes()
              .filter((node) => node.selected)
              .map((node) => node.id),
          )
        }}
        onPaneClick={(event) => {
          if (presentation.playing) return
          const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          if (createFloatingAt(point.x, point.y)) return
          useAnnotationInteraction.setState({ selected: null, editing: false, fromId: null })
          useEditor.getState().commitDraft()
          const id = useEditor.getState().selectedId
          useEditor.getState().select(id)
          window.document
            .querySelector<HTMLElement>(`.topic-input[data-topic-id="${CSS.escape(id)}"]`)
            ?.focus({ preventScroll: true })
        }}
        onDoubleClick={(event) => {
          if (presentation.playing) return
          if (
            !(event.target instanceof Element) ||
            !event.target.classList.contains('react-flow__pane')
          )
            return
          const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          useAnnotationInteraction.setState({ floating: true })
          createFloatingAt(point.x, point.y)
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
        fitViewOptions={initialFit}
        minZoom={0.15}
        maxZoom={2}
        deleteKeyCode={null}
        nodesConnectable={reconnecting}
        connectOnClick={false}
        edgesFocusable={false}
        nodesFocusable={false}
        nodesDraggable={!presentation.playing}
        elementsSelectable={!presentation.playing}
        selectNodesOnDrag
        nodeDragThreshold={4}
        selectionOnDrag={false}
        panOnDrag={[0, 1, 2]}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Control']}
        panOnScroll
        zoomActivationKeyCode={['Meta', 'Control']}
        zoomOnDoubleClick={false}
      >
        <StructureGeometry document={document} decorations={projection.decorations} />
        <CanvasAnnotations document={document} nodes={projection.layoutNodes} />
        <SelectionVisibility />
        {!presentation.playing && <CanvasMinimap />}
      </ReactFlow>
      {!presentation.playing && (
        <CanvasOverlay>
          <DragFeedback />
          <FloatingToolbar />
        </CanvasOverlay>
      )}
    </motion.section>
  )
}
