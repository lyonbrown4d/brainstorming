import { shallow } from 'zustand/shallow'
import { isEqual } from 'lodash-es'
import type { SpatialView } from '@renderer/state/spatialView'
import type { MindMapDocument } from '@core'
import { layoutDocument, type MindMapLayout } from '@layout'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'

type Projection = ReturnType<typeof projectCanvas>

/** One current projection per mounted canvas; history documents are never retained here. */
export const createCanvasProjector = () => {
  let previous: Projection | undefined
  let lastDocument: MindMapDocument | undefined
  let lastSurface: string | undefined
  let lastLayout: MindMapLayout | undefined
  let lastView: SpatialView | undefined
  return (
    document: MindMapDocument,
    layoutOrSurface?: MindMapLayout | string,
    surface?: string,
    refreshGeometry = false,
    spatial?: SpatialView,
  ): Projection => {
    const layout = typeof layoutOrSurface === 'object' ? layoutOrSurface : undefined
    const selectedSurface = typeof layoutOrSurface === 'string' ? layoutOrSurface : surface
    if (
      !refreshGeometry &&
      previous &&
      lastDocument === document &&
      lastSurface === selectedSurface &&
      lastView === spatial &&
      (!layout || lastLayout === layout)
    )
      return previous
    const selectedLayout = layout ?? layoutDocument(document)
    const next = projectCanvas(document, selectedSurface, selectedLayout)
    if (previous) {
      const nodes = new Map(previous.nodes.map((node) => [node.id, node]))
      next.nodes = next.nodes.map((node) => {
        const old = nodes.get(node.id)
        return old &&
          Object.is(old.position.x, node.position.x) &&
          Object.is(old.position.y, node.position.y) &&
          shallow(old.data, node.data) &&
          shallow(old.style, node.style) &&
          old.initialWidth === node.initialWidth &&
          old.initialHeight === node.initialHeight &&
          old.draggable === node.draggable &&
          old.zIndex === node.zIndex
          ? old
          : node
      })
      const edges = new Map(previous.edges.map((edge) => [edge.id, edge]))
      next.edges = next.edges.map((edge) => {
        const old = edges.get(edge.id)
        return old && old.data?.path === edge.data?.path && isEqual(old, edge) ? old : edge
      })
      if (
        !refreshGeometry &&
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
    lastView = spatial
    lastDocument = document
    lastLayout = selectedLayout
    lastSurface = selectedSurface
    return next
  }
}
