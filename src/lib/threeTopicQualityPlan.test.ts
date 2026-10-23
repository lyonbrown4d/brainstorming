import { describe, expect, it } from 'vitest'
import type { SpatialSceneRect } from '@renderer/lib/independentSpatialRuntime'
import { packTopicAtlas } from '@renderer/lib/threeTopicAtlasLayout'
import {
  planThreeTopicQuality,
  TOPIC_DETAIL_MAX_TILE_PIXELS,
} from '@renderer/lib/threeTopicQualityPlan'

const nodes = Array.from({ length: 1000 }, (_, index) => ({
  id: `topic-${index}`,
  x: 0,
  y: 0,
  width: 200,
  height: 80,
  side: 'right' as const,
}))
const overview = packTopicAtlas(nodes)
const rectangle = (id: string, width: number, x = 0): SpatialSceneRect => ({
  id,
  kind: 'topic',
  x,
  y: 0,
  width,
  height: width * 0.4,
  depth: 100,
})
const viewport = { x: 0, y: 0, width: 1000, height: 800, pixelRatio: 2 }

describe('bounded screen-density topic detail plan', () => {
  it('resolves Retina near-view sampling beyond the overview without enlarging every topic', () => {
    const plan = planThreeTopicQuality(
      nodes,
      overview,
      [rectangle('topic-0', 600), rectangle('topic-1', 20), rectangle('topic-2', 600, 2000)],
      viewport,
      new Set(),
    )
    expect(plan.map((tile) => tile.id)).toEqual(['topic-0'])
    expect(plan[0]?.pixelWidth).toBeGreaterThan(1400)
    expect(plan[0]?.pixelWidth).toBeLessThanOrEqual(1536)
    expect((plan[0]?.pixelWidth ?? 0) * (plan[0]?.pixelHeight ?? 0)).toBeLessThanOrEqual(
      TOPIC_DETAIL_MAX_TILE_PIXELS,
    )
  })

  it('prioritizes selection and keeps a thousand visible nodes inside one bounded page', () => {
    const rects = nodes.map((node) => rectangle(node.id, 250))
    const plan = planThreeTopicQuality(nodes, overview, rects, viewport, new Set(['topic-999']))
    expect(plan[0]?.id).toBe('topic-999')
    expect(plan.length).toBeLessThanOrEqual(24)
    expect(plan.length).toBeLessThan(nodes.length)
    for (const [index, tile] of plan.entries()) {
      expect(tile.page).toBe(0)
      expect(tile.x + tile.pixelWidth).toBeLessThanOrEqual(2048)
      expect(tile.y + tile.pixelHeight).toBeLessThanOrEqual(2048)
      expect(tile.pixelWidth * tile.pixelHeight).toBeLessThanOrEqual(TOPIC_DETAIL_MAX_TILE_PIXELS)
      const previous = plan[index - 1]
      if (previous)
        expect(
          tile.y >= previous.y + previous.pixelHeight ||
            (tile.y === previous.y && tile.x >= previous.x + previous.pixelWidth),
        ).toBe(true)
    }
  })

  it('reuses density buckets through small camera changes and limits very large square topics', () => {
    const first = planThreeTopicQuality(
      nodes,
      overview,
      [rectangle('topic-0', 300)],
      viewport,
      new Set(),
    )
    const second = planThreeTopicQuality(
      nodes,
      overview,
      [rectangle('topic-0', 310)],
      viewport,
      new Set(),
    )
    expect(first).toEqual(second)
    const square = [{ id: 'square', x: 0, y: 0, width: 200, height: 200, side: 'right' as const }]
    const plan = planThreeTopicQuality(
      square,
      packTopicAtlas(square),
      [{ ...rectangle('square', 4000), height: 4000 }],
      viewport,
      new Set(),
    )
    expect(plan[0]?.pixelWidth).toBe(1024)
    expect(plan[0]?.pixelHeight).toBe(1024)
  })
})
