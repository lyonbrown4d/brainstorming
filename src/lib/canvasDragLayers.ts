import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'

const layerHint = 'will-change-transform'

/** Promote only mounted moving nodes, only for the duration of a pointer gesture. */
export const canvasDragLayers = (
  nodes: CanvasFlowNode[],
  moving?: ReadonlySet<string>,
): CanvasFlowNode[] => {
  const next = nodes.map((node) => {
    const classes = node.className?.split(' ') ?? []
    const active = moving?.has(node.id) ?? false
    if (classes.includes(layerHint) === active) return node
    const className = active
      ? [...classes, layerHint].join(' ')
      : classes.filter((value) => value !== layerHint).join(' ')
    return { ...node, className }
  })
  return next.some((node, index) => node !== nodes[index]) ? next : nodes
}
