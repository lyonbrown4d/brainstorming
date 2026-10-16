import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  ReactFlow,
  useNodesState,
  useReactFlow,
  useViewport,
  type Edge,
  type OnNodeDrag,
} from '@xyflow/react'
import { Focus, Minus, Plus, Maximize2 } from 'lucide-react'
import { layoutDocument } from '@layout'
import type { MindMapDocument } from '@core'
import { useEditor } from '../state/editor'
import { TopicNode, type TopicFlowNode } from './TopicNode'
import { SelectionVisibility } from './SelectionVisibility'
import { FloatingToolbar } from './FloatingToolbar'
import { branchColors as colors, branchFills } from '../lib/topicAppearance'
const nodeTypes = { topic: TopicNode }
function branchColors(document: MindMapDocument): Map<string, string> {
  const result = new Map<string, string>()
  const root = document.topics[document.rootId]
  result.set(document.rootId, colors[0] ?? '#8b79d9')
  for (const [index, branch] of (root?.children ?? []).entries()) {
    const color = colors[index % colors.length] ?? '#8b79d9'
    const stack = [branch]
    while (stack.length > 0) {
      const id = stack.pop()
      if (!id) continue
      result.set(id, color)
      stack.push(...(document.topics[id]?.children ?? []))
    }
  }
  return result
}
export function ZoomControls() {
  const reduceMotion = useReducedMotion()
  const flow = useReactFlow<TopicFlowNode>()
  const { zoom } = useViewport()
  return (
    <div className="canvas-controls" aria-label="画布视图">
      <button
        title="缩小"
        aria-label="缩小"
        onClick={() => void flow.zoomOut({ duration: reduceMotion ? 0 : 160 })}
      >
        <Minus size={16} />
      </button>
      <span className="zoom-value">{Math.round(zoom * 100)}%</span>
      <button
        title="放大"
        aria-label="放大"
        onClick={() => void flow.zoomIn({ duration: reduceMotion ? 0 : 160 })}
      >
        <Plus size={16} />
      </button>
      <i />
      <button
        title="适应画布"
        aria-label="适应画布"
        onClick={() =>
          void flow.fitView({ padding: 0.12, maxZoom: 1.2, duration: reduceMotion ? 0 : 250 })
        }
      >
        <Maximize2 size={16} />
      </button>
      <button
        title="聚焦选中主题"
        aria-label="聚焦选中主题"
        onClick={() => {
          const node = flow.getNode(useEditor.getState().selectedId)
          if (node)
            void flow.setCenter(
              node.position.x + (node.width ?? 160) / 2,
              node.position.y + (node.height ?? 48) / 2,
              { zoom: 1, duration: reduceMotion ? 0 : 250 },
            )
        }}
      >
        <Focus size={16} />
      </button>
    </div>
  )
}
export function Canvas() {
  const reduceMotion = useReducedMotion()
  const document = useEditor((state) => state.history.document)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const [savedView] = useState(() => useEditor.getState().views[activeSheetId])
  const projection = useMemo(() => {
    const layout = layoutDocument(document)
    const palette = branchColors(document)
    const nodes: TopicFlowNode[] = layout.nodes.flatMap((node) => {
      const topic = document.topics[node.id]
      return topic
        ? [
            {
              id: node.id,
              type: 'topic' as const,
              position: { x: node.x, y: node.y },
              style: { width: node.width, height: node.height },
              data: {
                topic,
                root: node.id === document.rootId,
                branch: document.topics[document.rootId]?.children.includes(node.id) ?? false,
                fill: branchFills[
                  (document.topics[document.rootId]?.children.indexOf(node.id) ?? 0) %
                    branchFills.length
                ],
                color: palette.get(node.id) ?? '#8b79d9',
              },
              draggable: node.id !== document.rootId,
            },
          ]
        : []
    })
    const edges: Edge[] = layout.edges.map((edge) => ({
      ...edge,
      type: document.topics[edge.target]?.style?.lineStyle === 'straight' ? 'straight' : 'default',
      sourceHandle:
        edge.source === document.rootId && document.topics[edge.target]?.side === 'left'
          ? 'left'
          : null,
      style: {
        stroke: palette.get(edge.target) ?? '#8b79d9',
        strokeWidth:
          document.topics[edge.target]?.style?.lineWidth ??
          (edge.source === document.rootId ? 3 : 2),
      },
      selectable: false,
    }))
    return { nodes, edges }
  }, [document])
  const [nodes, setNodes, onNodesChange] = useNodesState<TopicFlowNode>(projection.nodes)
  useEffect(() => {
    setNodes(projection.nodes)
  }, [projection.nodes, setNodes])
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
    const stack = [dragged.id]
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
    if (target)
      useEditor.getState().command({
        type: 'moveTopic',
        topicId: dragged.id,
        parentId: target.id,
        side:
          target.id === document.rootId
            ? dragged.position.x < target.position.x
              ? 'left'
              : 'right'
            : target.data.topic.side,
      })
    useEditor.setState({ dropTargetId: null })
    setNodes(projection.nodes)
  }
  return (
    <motion.section
      className="canvas"
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
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => {
          useEditor.getState().select(node.id)
          window.document
            .querySelector<HTMLElement>(`.topic-input[data-topic-id="${CSS.escape(node.id)}"]`)
            ?.focus({ preventScroll: true })
        }}
        onNodeDragStart={onDragStart}
        onNodeDrag={onDrag}
        onNodeDragStop={onDragStop}
        onPaneClick={() => {
          useEditor.getState().commitDraft()
          const id = useEditor.getState().selectedId
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
        selectionKeyCode={null}
        panOnScroll
        zoomOnDoubleClick={false}
      >
        <SelectionVisibility />
      </ReactFlow>
      <FloatingToolbar />
    </motion.section>
  )
}
