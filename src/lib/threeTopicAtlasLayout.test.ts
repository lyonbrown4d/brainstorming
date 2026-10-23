import { describe, expect, it } from 'vitest'
import {
  packTopicAtlas,
  TOPIC_ATLAS_SIZE,
  TOPIC_ATLAS_PAGES,
} from '@renderer/lib/threeTopicAtlasLayout'

describe('bounded spatial topic atlas', () => {
  it('packs one thousand varied topic cards without overlaps or dropping titles', () => {
    const inputs = Array.from({ length: 1000 }, (_, index) => ({
      id: `topic-${index}`,
      width: 112 + (index % 7) * 24,
      height: 44 + (index % 5) * 32,
    }))
    const tiles = packTopicAtlas(inputs)
    expect(tiles.map((tile) => tile.id)).toEqual(inputs.map((tile) => tile.id))
    expect(Math.max(...tiles.map((tile) => tile.page))).toBeLessThan(TOPIC_ATLAS_PAGES)
    for (const [index, tile] of tiles.entries()) {
      expect(tile.x + tile.pixelWidth).toBeLessThanOrEqual(TOPIC_ATLAS_SIZE)
      expect(tile.y + tile.pixelHeight).toBeLessThanOrEqual(TOPIC_ATLAS_SIZE)
      const previous = tiles[index - 1]
      if (previous?.page === tile.page)
        expect(
          tile.y >= previous.y + previous.pixelHeight ||
            (tile.y === previous.y && tile.x >= previous.x + previous.pixelWidth),
        ).toBe(true)
    }
  })

  it('downsamples extreme topic dimensions and rejects invalid geometry', () => {
    const [tile] = packTopicAtlas([{ id: 'large', width: 100000, height: 20000 }])
    expect(tile?.pixelWidth).toBeLessThanOrEqual(1024)
    expect(tile?.pixelHeight).toBeGreaterThan(0)
    expect(packTopicAtlas([])).toEqual([])
    expect(() => packTopicAtlas([{ id: 'bad', width: Number.NaN, height: 50 }])).toThrow('finite')
    expect(() => packTopicAtlas([{ id: 'bad', width: 0, height: 50 }])).toThrow('positive')
  })
})
