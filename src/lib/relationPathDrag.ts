import type { Relation, RelationPoint } from '@core/extensions'
import type { relationGeometry } from '@shared/relation-geometry'

export type RelationDragGeometry = ReturnType<typeof relationGeometry> & {
  readonly start: RelationPoint
  readonly end: RelationPoint
}

/** Endpoints remain bound to topics while only the route's editable points translate. */
export const translateRelationPath = (
  relation: Relation,
  geometry: RelationDragGeometry,
  delta: RelationPoint,
): Relation => {
  const controls =
    relation.routing === 'straight'
      ? [1 / 3, 2 / 3].map((fraction) => ({
          x: geometry.start.x + (geometry.end.x - geometry.start.x) * fraction,
          y: geometry.start.y + (geometry.end.y - geometry.start.y) * fraction,
        }))
      : geometry.controls
  const points = relation.routing === 'orthogonal' ? geometry.waypoints : controls
  const translated = points.map((point) =>
    geometry.relative({ x: point.x + delta.x, y: point.y + delta.y }),
  )
  return {
    ...relation,
    ...(relation.routing === 'orthogonal'
      ? { waypoints: translated }
      : { routing: 'curve', controlPoints: translated }),
  }
}
