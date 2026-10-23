import { LRUCache } from 'lru-cache'
import type { TopicShape } from '@core'
import { topicShapePath } from '@shared/topic-shapes'

export interface TopicShapeImage {
  readonly src: string
  readonly width: number
  readonly height: number
}

const images = new LRUCache<string, TopicShapeImage>({
  max: 512,
  maxSize: 2 * 1024 * 1024,
  sizeCalculation: (value, key) => (value.src.length + key.length) * 2,
})
const hexColor = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i

/** Cache only generated geometry and resolved colors; CSS variables retain inline SVG. */
export const topicShapeImage = (
  shape: TopicShape,
  width: number,
  height: number,
  fill: string,
  stroke: string,
): TopicShapeImage | null => {
  if (
    shape === 'text' ||
    ![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= 20_000) ||
    !hexColor.test(fill) ||
    !hexColor.test(stroke)
  )
    return null
  const key = `${shape}:${width}:${height}:${fill}:${stroke}`
  const cached = images.get(key)
  if (cached) return cached
  const outline =
    shape === 'ellipse' || shape === 'circle'
      ? `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}"`
      : `<path d="${topicShapePath(shape, width, height)}"`
  const extra =
    shape === 'sticky'
      ? `<path d="M${width * 0.84} ${height} V${height * 0.84} H${width}" fill="none" stroke="${stroke}"/>`
      : shape === 'card'
        ? `<path d="M${width * 0.08} ${height * 0.12} H${width * 0.92}" fill="none" stroke="${stroke}" stroke-width="3"/>`
        : ''
  // Three pixels preserve acute miter joins and the card header at the SVG boundary.
  const imageWidth = width + 6
  const imageHeight = height + 6
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" ` +
    `viewBox="-3 -3 ${imageWidth} ${imageHeight}" preserveAspectRatio="none">` +
    `${outline} fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${extra}</svg>`
  const image = {
    src: `data:image/svg+xml,${encodeURIComponent(markup)}`,
    width: imageWidth,
    height: imageHeight,
  }
  images.set(key, image)
  return image
}
