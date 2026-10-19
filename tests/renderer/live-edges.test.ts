import { describe, expect, it } from 'vitest'
import type { LayoutEdge, LayoutNode } from '@layout'
import { liveLayoutEdgePath } from '@shared/live-layout-geometry'
import { layoutEdgePath } from '@shared/layout-geometry'
import { liveSketchEdgePath } from '@shared/sketch-edges'
import { sketchPath } from '@shared/sketch'

const source: LayoutNode = { id: 'a', x: 0, y: 0, width: 100, height: 40, side: 'right' }
const target: LayoutNode = { ...source, id: 'b', x: 240, y: 100 }
const from = { x: 100, y: 20 }
const to = { x: 240, y: 120 }

describe('live structural edges', () => {
  it.each(['straight', 'orthogonal'] as const)(
    '%s follows both live endpoints and restores exactly',
    (routing) => {
      const edge: LayoutEdge = { id: 'e', source: 'a', target: 'b', direction: 'right', routing }
      const geometry = { source, target, edge, straight: false }
      const before = layoutEdgePath(edge, source, target)
      expect(liveLayoutEdgePath(geometry, from, to, 'right', 'left')).toBe(before)
      const moved = liveLayoutEdgePath(
        geometry,
        { x: 130, y: 40 },
        { x: 270, y: 190 },
        'right',
        'left',
      )
      expect(moved).not.toBe(before)
      expect(moved).toMatch(/^M 130 40 /)
      expect(moved).toContain('190')
      expect(
        liveSketchEdgePath(geometry, { x: 130, y: 40 }, { x: 270, y: 190 }, 'right', 'left'),
      ).toBe(sketchPath(moved, 'edge:e'))
      expect(liveLayoutEdgePath(geometry, from, to, 'right', 'left')).toBe(before)
      expect(target.x).toBe(240)
    },
  )

  it('interpolates waypoint motion like persisted offsets, including a group translation', () => {
    const edge: LayoutEdge = {
      id: 'e',
      source: 'a',
      target: 'b',
      waypoints: [from, { x: 170, y: 20 }, to],
    }
    const geometry = { source, target, edge, straight: false }
    expect(liveLayoutEdgePath(geometry, from, { x: 320, y: 180 }, 'right', 'left')).toBe(
      'M 100 20 L 210 50 L 320 180',
    )
    expect(
      liveLayoutEdgePath(geometry, { x: 130, y: 50 }, { x: 270, y: 150 }, 'right', 'left'),
    ).toBe('M 130 50 L 200 50 L 270 150')
    expect(edge.waypoints).toEqual([from, { x: 170, y: 20 }, to])
  })
})
