import { useCanvasInk } from '@renderer/state/canvasInk'
import { InkNode } from '@renderer/components/ink/InkNode'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { canvasSelection } from '@renderer/lib/canvasGesture'
import { CanvasContextMenu } from '@renderer/components/workbench/CanvasContextMenu'
import { CanvasInk } from '@renderer/components/ink/CanvasInk'
import { useAppearanceColors } from '@renderer/hooks/useAppearanceColors'
import { useMessages } from '@renderer/i18n/useMessages'

import { useEffect, useRef, useState } from 'react'
import { SpatialRenderingLayer } from '@renderer/components/spatial/SpatialRenderingLayer'
import { getSpatialViewport, setSpatialViewport } from '@renderer/state/spatialViewports'
import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { useSpatialViewportRestore } from '@renderer/hooks/useSpatialViewportRestore'
import { SpatialNavigationLayer } from '@renderer/components/spatial/SpatialNavigationLayer'
import { useSpatialReadiness } from '@renderer/hooks/useSpatialReadiness'
import { CanvasLoading } from '@renderer/components/workbench/CanvasLoading'
import { SpatialCanvasControls } from '@renderer/components/spatial/SpatialCanvasControls'
import { motion, useReducedMotion } from 'motion/react'
import { ConnectionMode, ReactFlow, useReactFlow } from '@xyflow/react'
import {
  createFloatingAt,
  createRelationFloatingAt,
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
import { useCanvasProjection } from '@renderer/hooks/useCanvasProjection'
import type { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { StructureEdge, StructureGeometry } from '@renderer/components/documents/StructureGeometry'
const nodeTypes = { topic: TopicNode, ink: InkNode }
const edgeTypes = { relation: RelationEdge, structure: StructureEdge }
const emptyProjection: ReturnType<typeof projectCanvas> = {
  nodes: [],
  edges: [],
  layoutNodes: [],
  decorations: [],
}
export { ZoomControls } from '@renderer/components/ZoomControls'
export const Canvas = () => {
  const { translate } = useMessages()

  const colors = useAppearanceColors()
  const { view, workbookId } = useActiveSpatialView()
  const { ready: spatialReady, onSceneReady, onWidgetReady } = useSpatialReadiness(view.mode)
  const flow = useReactFlow<CanvasFlowNode>()
  useCanvasViewport()
  const reduceMotion = useReducedMotion()
  const document = useEditor((state) => state.history.document)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const [savedView] = useState(() => getSpatialViewport(workbookId, activeSheetId, view.mode))
  const [initialFit] = useState(() => ({ padding: canvasFitPadding(), maxZoom: 1.2 }))
  const playing = usePresentation((state) => state.playing)
  const inkMode = useCanvasInk((state) => state.mode)
  const {
    projection: readyProjection,
    depths,
    interactionReady: layoutReady,
    nativeLayout,
    error,
    retry,
  } = useCanvasProjection(document, activeSheetId, colors.canvas)
  const viewportReady = useSpatialViewportRestore(layoutReady)
  const lensReady = view.mode === '2d' || view.cameraDistance !== undefined
  const interactionReady = layoutReady && viewportReady && spatialReady && lensReady
  const projection = readyProjection ?? emptyProjection
  const fitted = useRef(false)
  useEffect(() => {
    if (view.mode === '3d' || savedView || !readyProjection || fitted.current) return
    fitted.current = true
    const frame = requestAnimationFrame(() => {
      void flow.fitView(initialFit)
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [flow, initialFit, readyProjection, savedView, view.mode])
  const { reconnecting, ...relations } = useCanvasRelations(projection.edges)
  const drag = useCanvasDrag(
    projection.nodes,
    `${activeSheetId}:${document.id}`,
    depths ?? undefined,
    interactionReady,
    nativeLayout,
  )
  useEffect(() => {
    if (interactionReady) return
    const block = (event: KeyboardEvent): void => {
      if (event.target instanceof Element && event.target.closest('#sheet-panel')) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', block, true)
    return () => {
      window.removeEventListener('keydown', block, true)
    }
  }, [interactionReady])
  const placedOnClick = useRef(false)
  return (
    <CanvasContextMenu>
      <motion.section
        className={`canvas relative min-w-0 flex-1 [container-name:mindmap] [container-type:inline-size] ${view.mode === '3d' ? '[&_.react-flow__node-topic:has(.is-editing)]:!z-[1000]' : ''}`}
        style={{
          backgroundColor: documentAppearance(document, colors.canvas).background,
          fontFamily: documentAppearance(document).fontFamily,
        }}
        data-view-mode={view.mode}
        id="sheet-panel"
        role="tabpanel"
        tabIndex={-1}
        aria-label={translate('currentSheet')}
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.12 }}
      >
        {view.mode === '3d' && view.cameraDistance !== undefined && depths && nativeLayout && (
          <SpatialRenderingLayer
            nodes={drag.nodes}
            depths={depths}
            layout={nativeLayout}
            onReady={onSceneReady}
          />
        )}
        <ReactFlow<CanvasFlowNode>
          key={document.id}
          className={
            reconnecting
              ? '[&_.react-flow__handle]:!pointer-events-auto [&_.react-flow__handle]:!size-3 [&_.react-flow__handle]:!border-2 [&_.react-flow__handle]:!border-primary [&_.react-flow__handle]:!bg-background [&_.react-flow__handle]:!opacity-100'
              : ''
          }
          {...drag}
          nodes={readyProjection ? drag.nodes : []}
          {...relations}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(event, node) => {
            if (playing) return
            if (node.type === 'ink') {
              useAnnotationInteraction.setState({
                selected: null,
                editing: false,
                fromId: null,
                relationMode: false,
              })
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
            if (event.detail > 1 && placedOnClick.current) return
            placedOnClick.current = false
            const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
            if (createRelationFloatingAt(point.x, point.y) || createFloatingAt(point.x, point.y)) {
              placedOnClick.current = true
              return
            }
            useAnnotationInteraction.setState({
              selected: null,
              editing: false,
              fromId: null,
              relationMode: false,
            })
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
            // A placement tool already consumed this physical double-click's first click.
            if (placedOnClick.current) {
              placedOnClick.current = false
              return
            }
            const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
            if (createRelationFloatingAt(point.x, point.y)) return
            useAnnotationInteraction.setState({ floating: true })
            createFloatingAt(point.x, point.y)
          }}
          onlyRenderVisibleElements
          defaultViewport={savedView ?? { x: 0, y: 0, zoom: 1 }}
          fitView={!savedView && view.mode === '2d'}
          onMoveEnd={(_event, viewport) => {
            if (view.mode === '2d' && useEditor.getState().activeSheetId === activeSheetId)
              setSpatialViewport(workbookId, activeSheetId, '2d', viewport)
          }}
          fitViewOptions={initialFit}
          minZoom={view.mode === '3d' ? 0.000001 : 0.15}
          maxZoom={view.mode === '3d' ? 10_000 : 2}
          deleteKeyCode={null}
          nodesConnectable={interactionReady && !playing && inkMode === 'select'}
          connectionMode={ConnectionMode.Loose}
          connectOnClick={false}
          edgesFocusable={false}
          nodesFocusable={false}
          nodesDraggable={interactionReady && !playing && inkMode === 'select'}
          elementsSelectable={interactionReady && !playing && inkMode === 'select'}
          selectNodesOnDrag
          elevateNodesOnSelect={view.mode === '2d'}
          nodeDragThreshold={4}
          autoPanOnNodeDrag={view.mode === '2d'}
          selectionOnDrag={false}
          panOnDrag={view.mode === '2d' && inkMode === 'select' ? [0, 1] : false}
          selectionKeyCode="Shift"
          multiSelectionKeyCode={['Meta', 'Control']}
          panOnScroll={view.mode === '2d'}
          zoomOnScroll={view.mode === '2d'}
          zoomOnPinch={view.mode === '2d'}
          zoomActivationKeyCode={view.mode === '2d' ? ['Meta', 'Control'] : null}
          zoomOnDoubleClick={false}
        >
          {!playing && <SpatialCanvasControls layout={nativeLayout} depths={depths} />}
          {!playing && view.mode === '3d' && (
            <SpatialNavigationLayer
              disabled={!interactionReady}
              onReady={onWidgetReady}
              layout={nativeLayout}
              depths={depths}
              drawings={document.drawings}
            />
          )}
          <StructureGeometry document={document} decorations={projection.decorations} />
          <CanvasAnnotations document={document} nodes={projection.layoutNodes} />
          <SelectionVisibility />
          {!playing && <CanvasDropPreview />}
          {!playing && <CanvasInk />}
          {!playing && <CanvasMinimap />}
        </ReactFlow>
        {!interactionReady && <CanvasLoading error={Boolean(error)} retry={retry} />}
        {!playing && (
          <CanvasOverlay>
            <DragFeedback />
            <FloatingToolbar />
          </CanvasOverlay>
        )}
      </motion.section>
    </CanvasContextMenu>
  )
}
