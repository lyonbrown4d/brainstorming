import { CubicBezierLine } from '@react-three/drei'
import { topicAppearance } from '@shared/appearance'
import type { MindMapDocument } from '@core'
import type { SpatialLayout, SpatialNode } from '@layout/spatial'
import { SpatialPathLine } from '@renderer/components/spatial/SpatialStructureGeometry'

export const SpatialConnections = ({
  document,
  layout,
  nodesById,
  colors,
  focusIds,
}: {
  readonly document: MindMapDocument
  readonly layout: SpatialLayout
  readonly nodesById: ReadonlyMap<string, SpatialNode>
  readonly colors: ReadonlyMap<string, string>
  readonly focusIds: ReadonlySet<string> | null
}) => {
  return layout.edges.map((edge) => {
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target || edge.routing === 'hidden' || !edge.path) return null
    const faded = focusIds !== null && (!focusIds.has(source.id) || !focusIds.has(target.id))
    const color = colors.get(target.branchId) ?? '#9788d3'
    const lineWidth = topicAppearance(document, target.id).lineWidth
    const opacity = faded ? 0.16 : 0.82
    if (
      edge.routing === undefined &&
      !edge.waypoints &&
      (edge.direction === 'left' || edge.direction === 'right')
    ) {
      const direction = edge.direction === 'left' ? -1 : 1
      const bend =
        document.topics[target.id]?.style?.lineStyle === 'straight'
          ? 0
          : Math.abs(edge.end[0] - edge.start[0]) * 0.5
      return (
        <CubicBezierLine
          key={edge.id}
          name={edge.id}
          start={[...edge.start]}
          end={[...edge.end]}
          midA={[edge.start[0] + bend * direction, edge.start[1], edge.start[2]]}
          midB={[edge.end[0] - bend * direction, edge.end[1], edge.end[2]]}
          color={color}
          lineWidth={lineWidth}
          transparent
          opacity={opacity}
        />
      )
    }
    return (
      <SpatialPathLine
        key={edge.id}
        name={edge.id}
        kind={edge.waypoints ? 'rib' : (edge.routing ?? 'connection')}
        path={edge.path}
        startZ={edge.start[2]}
        endZ={edge.end[2]}
        color={color}
        lineWidth={lineWidth}
        opacity={opacity}
      />
    )
  })
}
