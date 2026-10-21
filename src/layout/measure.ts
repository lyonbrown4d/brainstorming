import type { Topic, TopicImage } from '@core'
import { topicShapeInsets, showsTopicNotes } from '@shared/topic-shapes'
import { measureTopicMarkers } from '@layout/markers'
/** Fit raster images without upscaling; shared with the renderer to reserve the same bounds. */
export const measureTopicImage = (
  image: TopicImage,
): {
  width: number
  height: number
} => {
  const scale = Math.min(1, 200 / image.width, 140 / image.height)
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  }
}
/** Deterministic estimates shared by layout and renderer; no browser measurements enter the document. */
export const measureTopicContent = (
  title: string,
  isRoot = false,
  customFontSize?: number,
  content?: Pick<Topic, 'image' | 'notes' | 'attachments' | 'metadata' | 'style'>,
): {
  width: number
  height: number
} => {
  const fontSize = customFontSize ?? (isRoot ? 24 : 16)
  // Include the renderer's padding, borders, and a small font-metric tolerance.
  const padding = isRoot ? 56 : 44
  const maxWidth = isRoot ? 280 : 240
  const metadata = content?.metadata
  const markers = measureTopicMarkers(metadata)
  const verticalPadding = markers.extraHeight ? 12 : 0
  const shape = content?.style?.shape
  const fixedWidth = content?.style?.width
  const insets = topicShapeInsets(shape)
  const maxTextWidth =
    fixedWidth === undefined
      ? maxWidth - padding
      : Math.max(fontSize, fixedWidth * (1 - insets.x * 2) - padding - markers.extraWidth)
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
  const badgesHeight =
    metadata &&
    (metadata.labels?.length ||
      metadata.link ||
      metadata.task ||
      metadata.equation ||
      metadata.audioAssetId)
      ? 28
      : 0
  const detailsHeight = content?.notes || content?.attachments?.length ? 28 : 0
  const size = {
    width:
      fixedWidth === undefined
        ? Math.max(
            (isRoot ? 180 : 112) + verticalPadding,
            Math.min(
              maxWidth + verticalPadding,
              Math.ceil(longestLine + padding + verticalPadding),
            ),
            image ? image.width + padding + verticalPadding : 0,
            markers.extraHeight ? markers.width + 24 : 0,
          ) + markers.extraWidth
        : fixedWidth * (1 - insets.x * 2),
    height:
      Math.max(
        Math.max(isRoot ? 64 : 44, lines * Math.ceil(fontSize * 1.5) + (isRoot ? 28 : 20)) +
          (image ? image.height + 12 : 0),
        markers.height + 20,
      ) +
      markers.extraHeight +
      detailsHeight +
      badgesHeight +
      (showsTopicNotes(shape) && content?.notes ? 48 : 0) +
      (shape === 'image' && !image ? 52 : 0),
  }
  return size
}

export const measureTopic = (
  title: string,
  isRoot = false,
  customFontSize?: number,
  content?: Pick<Topic, 'image' | 'notes' | 'attachments' | 'metadata' | 'style'>,
): { width: number; height: number } => {
  const size = measureTopicContent(title, isRoot, customFontSize, content)
  const shape = content?.style?.shape
  const insets = topicShapeInsets(shape)
  const width = content?.style?.width ?? Math.ceil(size.width / (1 - insets.x * 2))
  const height = Math.ceil(size.height / (1 - insets.y * 2))
  const base =
    shape === 'circle'
      ? { width: Math.max(width, height), height: Math.max(width, height) }
      : { width, height }
  const scale = content?.style?.scale ?? 1
  return { width: base.width * scale, height: base.height * scale }
}
