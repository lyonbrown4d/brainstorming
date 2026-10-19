import { useCanvasInk } from '@renderer/state/canvasInk'
import { InkNode } from '@renderer/components/ink/InkNode'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { canvasSelection } from '@renderer/lib/canvasGesture'
import { CanvasInk } from '@renderer/components/ink/CanvasInk'
import { useAppearanceColors } from '@renderer/hooks/useAppearanceColors'
import { useMessages } from '@renderer/i18n/useMessages'

import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ConnectionMode, ReactFlow, useReactFlow } from '@xyflow/react'
import {
  createFloatingAt,
  interactAnnotationTopic,
  useAnnotationInteraction,
} from '@renderer/state/annotationInteraction'
import { useCanvasRelations } from '@renderer/hooks/useCanvasRelations'
import { canvasFitPadding } from '@renderer/hooks/useWorkbenchInsets'
import { CanvasOverlay } from '@renderer/components/workbench/CanvasOverlay'
import { useCanvasViewport } from '@renderer/hooks/useCanvasViewport'
import { useCanvasDrag } from '@renderer/hooks/useCanvasDrag'
import { CanvasDropPreview } from '@renderer/components/workbench/CanvasDropPreview'
import { DragFeedback } from '@renderer/components/workbench/DragFeedback'
import { CanvasMinimap } from '@renderer/components/CanvasMinimap'
import { RelationEdge } from '@renderer/components/annotations/RelationEdge'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { selectTopic, selectDrawing, setCanvasSelection } from '@renderer/state/selection'
import { TopicNode } from '@renderer/components/TopicNode'
import { CanvasAnnotations } from '@renderer/components/annotations/CanvasAnnotations'
import { SelectionVisibility } from '@renderer/components/SelectionVisibility'
import { FloatingToolbar } from '@renderer/components/FloatingToolbar'
import { documentAppearance } from '@shared/appearance'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'
import { StructureEdge, StructureGeometry } from '@renderer/components/documents/StructureGeometry'
const nodeTypes = { topic: TopicNode, ink: InkNode }
const edgeTypes = { relation: RelationEdge, structure: StructureEdge }
export { ZoomControls } from '@renderer/components/ZoomControls'
export const Canvas = () => {
  const { translate } = useMessages()

  const colors = useAppearanceColors()
  const flow = useReactFlow<CanvasFlowNode>()
  useCanvasViewport()
  const reduceMotion = useReducedMotion()
  const document = useEditor((state) => state.history.document)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const [savedView] = useState(() => useEditor.getState().views[activeSheetId])
  const [initialFit] = useState(() => ({ padding: canvasFitPadding(), maxZoom: 1.2 }))
  const playing = usePresentation((state) => state.playing)
  const inkMode = useCanvasInk((state) => state.mode)
  const [project] = useState(createCanvasProjector)
  const projection = useMemo(
    () => project(document, colors.canvas),
    [document, colors.canvas, project],
  )
  const { reconnecting, ...relations } = useCanvasRelations(projection.edges)
  const drag = useCanvasDrag(projection.nodes)
  return (
    <motion.section
      className="canvas relative min-w-0 flex-1 [container-name:mindmap] [container-type:inline-size]"
      style={{
        backgroundColor: documentAppearance(document, colors.canvas).background,
        fontFamily: documentAppearance(document).fontFamily,
      }}
      id="sheet-panel"
      role="tabpanel"
      tabIndex={-1}
      aria-label={translate('currentSheet')}
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.12 }}
    >
      <ReactFlow<CanvasFlowNode>
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
          if (playing) return
          if (node.type === 'ink') {
            useAnnotationInteraction.setState({ selected: null, editing: false, fromId: null })
            selectDrawing(node.data.stroke.id, event.metaKey || event.ctrlKey || event.shiftKey)
            window.document.getElementById('sheet-panel')?.focus({ preventScroll: true })
            return
          }
          if (interactAnnotationTopic(node.id)) return
          useAnnotationInteraction.setState({ selected: null, editing: false })
          selectTopic(node.id, event.metaKey || event.ctrlKey || event.shiftKey)
          window.document
            .querySelector<HTMLElement>(`.topic-input[data-topic-id="${CSS.escape(node.id)}"]`)
            ?.focus({ preventScroll: true })
        }}
        onSelectionEnd={() => {
          if (playing) return
          const selection = canvasSelection(flow.getNodes().filter((node) => node.selected))
          setCanvasSelection(selection.topics, selection.drawings)
        }}
        onPaneClick={(event) => {
          if (playing) return
          const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          if (createFloatingAt(point.x, point.y)) return
          useAnnotationInteraction.setState({ selected: null, editing: false, fromId: null })
          useEditor.getState().commitDraft()
          if (!useEditor.getState().editingId) setCanvasSelection([], [])
          window.document.getElementById('sheet-panel')?.focus({ preventScroll: true })
        }}
        onDoubleClick={(event) => {
          if (playing) return
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
        onMoveEnd={(_event, viewport) => {
          if (useEditor.getState().activeSheetId === activeSheetId)
            useEditor.setState((state) => ({
              views: { ...state.views, [activeSheetId]: viewport },
            }))
        }}
        fitViewOptions={initialFit}
        minZoom={0.15}
        maxZoom={2}
        deleteKeyCode={null}
        nodesConnectable={!playing && inkMode === 'select'}
        connectionMode={ConnectionMode.Loose}
        connectOnClick={false}
        edgesFocusable={false}
        nodesFocusable={false}
        nodesDraggable={!playing && inkMode === 'select'}
        elementsSelectable={!playing && inkMode === 'select'}
        selectNodesOnDrag
        nodeDragThreshold={4}
        selectionOnDrag={false}
        panOnDrag={inkMode === 'select' ? [0, 1, 2] : false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Control']}
        panOnScroll
        zoomActivationKeyCode={['Meta', 'Control']}
        zoomOnDoubleClick={false}
      >
        <StructureGeometry document={document} decorations={projection.decorations} />
        <CanvasAnnotations document={document} nodes={projection.layoutNodes} />
        <SelectionVisibility />
        {!playing && <CanvasDropPreview />}
        {!playing && <CanvasInk />}
        {!playing && <CanvasMinimap />}
      </ReactFlow>
      {!playing && (
        <CanvasOverlay>
          <DragFeedback />
          <FloatingToolbar />
        </CanvasOverlay>
      )}
    </motion.section>
  )
}
