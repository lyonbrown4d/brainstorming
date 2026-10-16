import type { Topic, TopicImage } from '@core'

/** Fit raster images without upscaling; shared with the renderer to reserve the same bounds. */
export function measureTopicImage(image: TopicImage): { width: number; height: number } {
  const scale = Math.min(1, 200 / image.width, 140 / image.height)
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  }
}

/** Deterministic estimates shared by layout and renderer; no browser measurements enter the document. */
export function measureTopic(
  title: string,
  isRoot = false,
  customFontSize?: number,
  content?: Pick<Topic, 'image' | 'notes' | 'attachments' | 'metadata'>,
): { width: number; height: number } {
  const fontSize = customFontSize ?? (isRoot ? 24 : 16)
  // Include the renderer's padding, borders, and a small font-metric tolerance.
  const padding = isRoot ? 56 : 44
  const maxWidth = isRoot ? 280 : 240
  const maxTextWidth = maxWidth - padding
  let lineWidth = 0
  let longestLine = 0
  let lines = 1
  for (const character of title) {
    if (character === '\n') {
      longestLine = Math.max(longestLine, lineWidth)
      lineWidth = 0
      lines += 1
      continue
    }
    const width = (character.codePointAt(0) ?? 0) > 255 ? fontSize : fontSize * 0.62
    if (lineWidth + width > maxTextWidth && lineWidth > 0) {
      longestLine = Math.max(longestLine, lineWidth)
      lineWidth = 0
      lines += 1
    }
    lineWidth += width
  }
  longestLine = Math.max(longestLine, lineWidth)
  const image = content?.image ? measureTopicImage(content.image) : undefined
  const metadata = content?.metadata
  const badgesHeight =
    metadata &&
    (metadata.labels?.length ||
      metadata.markers?.length ||
      metadata.link ||
      metadata.task ||
      metadata.equation ||
      metadata.audioAssetId)
      ? 28
      : 0
  const detailsHeight = content?.notes || content?.attachments?.length ? 28 : 0
  return {
    width: Math.max(
      isRoot ? 180 : 112,
      Math.min(maxWidth, Math.ceil(longestLine + padding)),
      image ? image.width + padding : 0,
    ),
    height:
      Math.max(isRoot ? 64 : 44, lines * Math.ceil(fontSize * 1.5) + (isRoot ? 28 : 20)) +
      (image ? image.height + 12 : 0) +
      detailsHeight +
      badgesHeight,
  }
}
