import { getBezierPath, getStraightPath, Position } from '@xyflow/system'
import type { Relation, RelationAnchor, RelationPoint } from '@core/extensions'

export interface RelationBox extends RelationPoint {
  readonly width: number
  readonly height: number
}
export const relationAnchors = (relation: Relation, from: RelationBox, to: RelationBox) => {
  const dx = to.x + to.width / 2 - from.x - from.width / 2
  const dy = to.y + to.height / 2 - from.y - from.height / 2
  const vertical = Math.abs(dy) > Math.abs(dx)
  return {
    source:
      relation.sourceAnchor ?? (vertical ? (dy > 0 ? 'bottom' : 'top') : dx > 0 ? 'right' : 'left'),
    target:
      relation.targetAnchor ?? (vertical ? (dy > 0 ? 'top' : 'bottom') : dx > 0 ? 'left' : 'right'),
  } satisfies { source: RelationAnchor; target: RelationAnchor }
}
export const anchorPoint = (box: RelationBox, anchor: RelationAnchor): RelationPoint => ({
  x: box.x + (anchor === 'left' ? 0 : anchor === 'right' ? box.width : box.width / 2),
  y: box.y + (anchor === 'top' ? 0 : anchor === 'bottom' ? box.height : box.height / 2),
})
const add = (a: RelationPoint, b: RelationPoint): RelationPoint => ({ x: a.x + b.x, y: a.y + b.y })
const offset = (p: RelationPoint, base: RelationPoint): RelationPoint => ({
  x: p.x - base.x,
  y: p.y - base.y,
})
const position = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}
const pointText = (point: RelationPoint) => `${point.x} ${point.y}`
const control = (
  point: RelationPoint,
  other: RelationPoint,
  side: RelationAnchor,
): RelationPoint => {
  // Matches React Flow's default curvature so the first handle drag never changes the path.
  const horizontal = side === 'left' || side === 'right'
  const sign = side === 'left' || side === 'top' ? -1 : 1
  const distance = (horizontal ? other.x - point.x : other.y - point.y) * sign
  const reach = distance >= 0 ? distance * 0.5 : 0.25 * 25 * Math.sqrt(-distance)
  return {
    x: point.x + (horizontal ? sign * reach : 0),
    y: point.y + (horizontal ? 0 : sign * reach),
  }
}
export const relationGeometry = (
  relation: Relation,
  start: RelationPoint,
  end: RelationPoint,
  source: RelationAnchor = relation.sourceAnchor ?? 'right',
  target: RelationAnchor = relation.targetAnchor ?? 'left',
) => {
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const controls = relation.controlPoints?.map((p) => add(p, midpoint)) ?? [
    control(start, end, source),
    control(end, start, target),
  ]
  const waypoints = relation.waypoints?.map((p) => add(p, midpoint)) ?? [midpoint]
  const route = relation.routing ?? 'curve'
  const points = [start, end]
  let path: string
  let center = midpoint
  if (route === 'straight') {
    ;[path] = getStraightPath({
      sourceX: start.x,
      sourceY: start.y,
      targetX: end.x,
      targetY: end.y,
    })
  } else if (route === 'orthogonal') {
    const vertices: RelationPoint[] = [start]
    for (const waypoint of waypoints) {
      const previous = vertices.at(-1) ?? start
      const vertical = vertices.length === 1 && (source === 'top' || source === 'bottom')
      vertices.push(
        vertical ? { x: previous.x, y: waypoint.y } : { x: waypoint.x, y: previous.y },
        waypoint,
      )
    }
    const previous = vertices.at(-1) ?? start
    const horizontal = target === 'left' || target === 'right'
    vertices.push(horizontal ? { x: previous.x, y: end.y } : { x: end.x, y: previous.y }, end)
    points.push(...vertices)
    path = `M ${vertices.map(pointText).join(' L ')}`
    center = waypoints[Math.floor(waypoints.length / 2)] ?? midpoint
  } else {
    const [first, second] = controls
    if (!first || !second) throw new Error('关联线控制点无效')
    points.push(first, second)
    if (relation.controlPoints) {
      path = `M ${pointText(start)} C ${pointText(first)} ${pointText(second)} ${pointText(end)}`
      center = {
        x: (start.x + 3 * first.x + 3 * second.x + end.x) / 8,
        y: (start.y + 3 * first.y + 3 * second.y + end.y) / 8,
      }
    } else {
      let x: number, y: number
      ;[path, x, y] = getBezierPath({
        sourceX: start.x,
        sourceY: start.y,
        targetX: end.x,
        targetY: end.y,
        sourcePosition: position[source],
        targetPosition: position[target],
      })
      center = { x, y }
    }
  }
  const padding = (relation.width ?? 2) * 6 + 4
  const left = Math.min(...points.map((p) => p.x)) - padding
  const top = Math.min(...points.map((p) => p.y)) - padding
  // Keep a default label clear of the route and its midpoint controls.
  const labelOffset = relation.labelOffset ?? { x: 0, y: -28 }
  return {
    path,
    midpoint,
    controls,
    waypoints,
    labelOffset,
    label: add(center, labelOffset),
    bounds: {
      x: left,
      y: top,
      width: Math.max(...points.map((p) => p.x)) - left + padding,
      height: Math.max(...points.map((p) => p.y)) - top + padding,
    },
    relative: (point: RelationPoint) => offset(point, midpoint),
  }
}
export const relationLayoutGeometry = (relation: Relation, from: RelationBox, to: RelationBox) => {
  const anchors = relationAnchors(relation, from, to)
  return relationGeometry(
    relation,
    anchorPoint(from, anchors.source),
    anchorPoint(to, anchors.target),
    anchors.source,
    anchors.target,
  )
}
export const resetRelationGeometry = (relation: Relation): Relation => {
  return {
    id: relation.id,
    from: relation.from,
    to: relation.to,
    ...(relation.title !== undefined ? { title: relation.title } : {}),
    ...(relation.color !== undefined ? { color: relation.color } : {}),
    ...(relation.width !== undefined ? { width: relation.width } : {}),
    ...(relation.dashed !== undefined ? { dashed: relation.dashed } : {}),
    ...(relation.arrow !== undefined ? { arrow: relation.arrow } : {}),
    ...(relation.routing !== undefined ? { routing: relation.routing } : {}),
  }
}
