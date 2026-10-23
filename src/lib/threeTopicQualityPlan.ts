import type { LayoutNode } from '@layout'
import type { SpatialSceneRect } from '@renderer/lib/independentSpatialRuntime'
import { TOPIC_ATLAS_SIZE, type TopicAtlasTile } from '@renderer/lib/threeTopicAtlasLayout'

export const TOPIC_DETAIL_MAX_TILES = 24
export const TOPIC_DETAIL_MAX_EDGE = 1536
export const TOPIC_DETAIL_MAX_TILE_PIXELS = 1024 ** 2
export const TOPIC_DETAIL_CACHE_PIXELS = 2 * 1024 ** 2
export interface TopicQualityViewport {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly pixelRatio: number
}
const densities = [1, 1.5, 2, 3, 4, 6, 8, 12, 16]

/** Called after navigation settles, never on a camera frame. Prioritize visible undersampled titles. */
export const planThreeTopicQuality = (
  nodes: readonly LayoutNode[],
  overview: readonly TopicAtlasTile[],
  rectangles: readonly SpatialSceneRect[],
  viewport: TopicQualityViewport,
  selected: ReadonlySet<string>,
): TopicAtlasTile[] => {
  const layout = new Map(nodes.map((node) => [node.id, node]))
  const base = new Map(overview.map((tile) => [tile.id, tile]))
  const candidates = rectangles
    .flatMap((rect) => {
      const node = layout.get(rect.id),
        tile = base.get(rect.id)
      if (
        rect.kind !== 'topic' ||
        !node ||
        !tile ||
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.x + rect.width < viewport.x ||
        rect.y + rect.height < viewport.y ||
        rect.x > viewport.x + viewport.width ||
        rect.y > viewport.y + viewport.height
      )
        return []
      const desired =
        Math.max(rect.width / node.width, rect.height / node.height) *
        Math.max(1, viewport.pixelRatio) *
        1.2
      if (
        (node.width + 8) * desired <= tile.pixelWidth * 1.2 &&
        (node.height + 8) * desired <= tile.pixelHeight * 1.2
      )
        return []
      const density = densities.find((value) => value >= desired) ?? 16
      const width = (node.width + 8) * density,
        height = (node.height + 8) * density
      const cap = Math.min(
        1,
        TOPIC_DETAIL_MAX_EDGE / Math.max(width, height),
        Math.sqrt(TOPIC_DETAIL_MAX_TILE_PIXELS / (width * height)),
      )
      const pixelWidth = Math.max(2, Math.floor(width * cap)),
        pixelHeight = Math.max(2, Math.floor(height * cap))
      if (pixelWidth <= tile.pixelWidth * 1.2 && pixelHeight <= tile.pixelHeight * 1.2) return []
      return [
        {
          id: node.id,
          width: node.width,
          height: node.height,
          pixelWidth,
          pixelHeight,
          priority: selected.has(node.id) ? 1 : 0,
          area: rect.width * rect.height,
        },
      ]
    })
    .sort((a, b) => b.priority - a.priority || b.area - a.area)
  const result: TopicAtlasTile[] = []
  let x = 0,
    y = 0,
    rowHeight = 0
  for (const item of candidates) {
    if (result.length >= TOPIC_DETAIL_MAX_TILES) break
    const nextRow = x + item.pixelWidth > TOPIC_ATLAS_SIZE
    const nextY = nextRow ? y + rowHeight : y
    if (nextY + item.pixelHeight > TOPIC_ATLAS_SIZE) continue
    if (nextRow) {
      x = 0
      y = nextY
      rowHeight = 0
    }
    result.push({
      id: item.id,
      width: item.width,
      height: item.height,
      pixelWidth: item.pixelWidth,
      pixelHeight: item.pixelHeight,
      page: 0,
      x,
      y,
    })
    x += item.pixelWidth
    rowHeight = Math.max(rowHeight, item.pixelHeight)
  }
  return result
}
