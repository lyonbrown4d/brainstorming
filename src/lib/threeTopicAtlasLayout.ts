export const TOPIC_ATLAS_SIZE = 2048
export const TOPIC_ATLAS_PAGES = 4
export const TOPIC_ATLAS_PADDING = 4

export interface TopicAtlasInput {
  readonly id: string
  readonly width: number
  readonly height: number
}
export interface TopicAtlasTile extends TopicAtlasInput {
  readonly page: number
  readonly x: number
  readonly y: number
  readonly pixelWidth: number
  readonly pixelHeight: number
}

/** Shelf packing retries at lower density rather than allocating unbounded GPU textures. */
export const packTopicAtlas = (inputs: readonly TopicAtlasInput[]): TopicAtlasTile[] => {
  if (!inputs.length) return []
  if (
    inputs.some(({ width, height }) => ![width, height].every((v) => Number.isFinite(v) && v > 0))
  )
    throw new Error('Topic atlas dimensions must be positive and finite')
  const area = inputs.reduce((total, item) => total + (item.width + 8) * (item.height + 8), 0)
  let density = Math.min(2, Math.sqrt((TOPIC_ATLAS_SIZE ** 2 * TOPIC_ATLAS_PAGES * 0.65) / area))
  for (let attempt = 0; attempt < 32; attempt++) {
    let page = 0,
      x = 0,
      y = 0,
      rowHeight = 0
    const tiles: TopicAtlasTile[] = []
    for (const item of inputs) {
      const ratio = Math.min(density, 1024 / Math.max(item.width + 8, item.height + 8))
      const pixelWidth = Math.max(2, Math.ceil((item.width + 8) * ratio))
      const pixelHeight = Math.max(2, Math.ceil((item.height + 8) * ratio))
      if (x + pixelWidth > TOPIC_ATLAS_SIZE) {
        x = 0
        y += rowHeight
        rowHeight = 0
      }
      if (y + pixelHeight > TOPIC_ATLAS_SIZE) {
        page++
        x = 0
        y = 0
        rowHeight = 0
      }
      if (page >= TOPIC_ATLAS_PAGES) break
      tiles.push({ ...item, page, x, y, pixelWidth, pixelHeight })
      x += pixelWidth
      rowHeight = Math.max(rowHeight, pixelHeight)
    }
    if (tiles.length === inputs.length) return tiles
    density *= 0.8
  }
  throw new Error('Topic atlas exceeds bounded texture capacity')
}
