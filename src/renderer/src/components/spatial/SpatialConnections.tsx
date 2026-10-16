import { CubicBezierLine } from '@react-three/drei'
import type { MindMapDocument } from '@core'
import type { SpatialLayout, SpatialNode } from '../../../../layout/spatial'

export function SpatialConnections({
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
}) {
  return layout.edges.map((edge) => {
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target) return null
    const topic = document.topics[target.id]
    const direction = target.position[0] > source.position[0] ? 1 : -1
    const start: [number, number, number] = [
      source.position[0] + (source.width / 2) * direction,
      source.position[1],
      source.position[2],
    ]
    const end: [number, number, number] = [
      target.position[0] - (target.width / 2) * direction,
      target.position[1],
      target.position[2],
    ]
    const bend = topic?.style?.lineStyle === 'straight' ? 0 : Math.abs(end[0] - start[0]) * 0.5
    const faded = focusIds !== null && (!focusIds.has(source.id) || !focusIds.has(target.id))
    return (
      <CubicBezierLine
        key={edge.id}
        start={start}
        end={end}
        midA={[start[0] + bend * direction, start[1], start[2]]}
        midB={[end[0] - bend * direction, end[1], end[2]]}
        color={colors.get(target.branchId) ?? '#9788d3'}
        lineWidth={topic?.style?.lineWidth ?? (source.depth === 0 ? 3.5 : 2.4)}
        transparent
        opacity={faded ? 0.16 : 0.82}
      />
    )
  })
}
