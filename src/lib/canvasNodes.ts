import type { Node } from '@xyflow/react'
import type { CanvasStroke, MindMapDocument } from '@core'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import { inkGeometry } from '@shared/ink-geometry'

export type InkFlowNode = Node<{ stroke: CanvasStroke }, 'ink'> & { type: 'ink' }
export type CanvasFlowNode = TopicFlowNode | InkFlowNode

/** Keep renderer IDs distinct even when a topic uses a stroke-like arbitrary ID. */
export const projectInk = (document: MindMapDocument): InkFlowNode[] => {
  const used = new Set(Object.keys(document.topics))
  return (document.drawings ?? []).map((stroke) => {
    let id = `ink:${stroke.id}`
    while (used.has(id)) id = `ink:${id}`
    used.add(id)
    const bounds = inkGeometry(stroke).bounds
    return {
      id,
      type: 'ink',
      data: { stroke },
      position: { x: bounds.x, y: bounds.y },
      initialWidth: bounds.width,
      initialHeight: bounds.height,
      style: { width: bounds.width, height: bounds.height, pointerEvents: 'none' },
      draggable: true,
      selectable: true,
      connectable: false,
      zIndex: -1,
    }
  })
}
