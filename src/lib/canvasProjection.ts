import { shallow } from 'zustand/shallow'
import { isEqual } from 'lodash-es'
import type { MindMapDocument } from '@core'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'

type Projection = ReturnType<typeof projectCanvas>

/** One current projection per mounted canvas; history documents are never retained here. */
export const createCanvasProjector = () => {
  let previous: Projection | undefined
  let lastDocument: MindMapDocument | undefined
  let lastSurface: string | undefined
  return (document: MindMapDocument, surface?: string): Projection => {
    if (previous && lastDocument === document && lastSurface === surface) return previous
    const next = projectCanvas(document, surface)
    if (previous) {
      const nodes = new Map(previous.nodes.map((node) => [node.id, node]))
      next.nodes = next.nodes.map((node) => {
        const old = nodes.get(node.id)
        return old &&
          shallow(old.data, node.data) &&
          shallow(old.position, node.position) &&
          shallow(old.style, node.style) &&
          old.initialWidth === node.initialWidth &&
          old.initialHeight === node.initialHeight &&
          old.draggable === node.draggable
          ? old
          : node
      })
      const edges = new Map(previous.edges.map((edge) => [edge.id, edge]))
      next.edges = next.edges.map((edge) => {
        const old = edges.get(edge.id)
        return old && isEqual(old, edge) ? old : edge
      })
      if (
        next.nodes.every((node, index) => node === previous?.nodes[index]) &&
        next.nodes.length === previous.nodes.length
      )
        next.nodes = previous.nodes
      if (
        next.edges.every((edge, index) => edge === previous?.edges[index]) &&
        next.edges.length === previous.edges.length
      )
        next.edges = previous.edges
    }
    previous = next
    lastDocument = document
    lastSurface = surface
    return next
  }
}
