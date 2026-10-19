import type { LayoutDirection } from '@layout'
import { liveLayoutEdgePath, type LiveEdgeGeometry } from '@shared/live-layout-geometry'
import { sketchPath } from '@shared/sketch'

export const liveSketchEdgePath = (
  geometry: LiveEdgeGeometry,
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromSide: LayoutDirection,
  toSide: LayoutDirection,
): string =>
  sketchPath(liveLayoutEdgePath(geometry, from, to, fromSide, toSide), `edge:${geometry.edge.id}`)
