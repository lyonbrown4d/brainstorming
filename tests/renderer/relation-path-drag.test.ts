import { describe, expect, it } from 'vitest'
import type { Relation } from '@core'
import { relationGeometry } from '@shared/relation-geometry'
import { translateRelationPath } from '@renderer/lib/relationPathDrag'

const start = { x: 20, y: 30 },
  end = { x: 320, y: 150 }
const relation: Relation = {
  id: 'r',
  from: 'a',
  to: 'b',
  title: '关系',
  sourceAnchor: 'right',
  targetAnchor: 'left',
  labelOffset: { x: 5, y: -15 },
}

describe('relation body route translation', () => {
  it('keeps default labels above controls while preserving explicit label placement', () => {
    const geometry = relationGeometry(
      { id: 'r', from: 'a', to: 'b' },
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    )
    expect(geometry.label).toEqual({ x: 150, y: -28 })
    expect(geometry.labelOffset).toEqual({ x: 0, y: -28 })
    const explicit = relationGeometry(
      { id: 'r', from: 'a', to: 'b', labelOffset: { x: 0, y: 0 } },
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    )
    expect(explicit.label).toEqual({ x: 150, y: 0 })
  })
  it.each(['curve', 'orthogonal', 'straight'] as const)(
    'moves the %s route without moving its bound endpoints or label offset',
    (routing) => {
      const original = { ...relation, routing }
      const geometry = { ...relationGeometry(original, start, end), start, end }
      const delta = { x: 45, y: -70 }
      const moved = translateRelationPath(original, geometry, delta)
      expect(original).toEqual({ ...relation, routing })
      expect(moved).toMatchObject(relation)
      if (routing === 'orthogonal') {
        expect(moved.routing).toBe('orthogonal')
        expect(moved.waypoints).toEqual([{ x: 45, y: -70 }])
      } else {
        expect(moved.routing).toBe('curve')
        const zero = translateRelationPath(original, geometry, { x: 0, y: 0 })
        expect(moved.controlPoints).toEqual(
          zero.controlPoints?.map((point) => ({
            x: point.x + delta.x,
            y: point.y + delta.y,
          })),
        )
        if (routing === 'straight')
          expect(zero.controlPoints).toEqual([
            { x: -50, y: -20 },
            { x: 50, y: 20 },
          ])
      }
      const rendered = relationGeometry(moved, start, end)
        .path.match(/-?\d+(?:\.\d+)?/gu)
        ?.map(Number)
      expect(rendered?.slice(0, 2)).toEqual([start.x, start.y])
      expect(rendered?.slice(-2)).toEqual([end.x, end.y])
    },
  )
})
