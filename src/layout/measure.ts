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
/** Title area chrome: 10px padding above and below plus the 1.5px border on each edge. */
const TITLE_CHROME = 23
/** Line box height of the renderer's `leading-normal` titles. */
const LINE_HEIGHT = 1.5
const NARROW = new Set('ijltfrI.,:;\'`!|()[]{}/\\"')
const WIDE = new Set('WMmw@%')

/**
 * Estimated advance for one character in em. Values are conservative upper bounds for the
 * default font stack so real text stays inside the measured box instead of overflowing it.
 */
const advanceEm = (code: number): number => {
  if (code === 0x20 || code === 0x09) return 0.3
  if (code > 0xff) return 1
  const character = String.fromCharCode(code)
  if (code >= 0x41 && code <= 0x5a) return WIDE.has(character) ? 0.95 : 0.78
  if (code >= 0x61 && code <= 0x7a) return WIDE.has(character) ? 0.95 : 0.62
  if (code >= 0x30 && code <= 0x39) return 0.68
  if (NARROW.has(character)) return 0.4
  return 0.72
}

const textWidth = (text: string, fontSize: number): number => {
  let width = 0
  for (const character of text) width += advanceEm(character.codePointAt(0) ?? 0) * fontSize
  return width
}

/** Greedy wrapping that follows the browser: break at spaces first, split overlong words. */
const measureTitleLines = (
  title: string,
  maxTextWidth: number,
  fontSize: number,
): { longestLine: number; lines: number } => {
  let lines = 1
  let current = 0
  let longest = 0
  let gap = 0
  let lineStart = true
  const endLine = () => {
    longest = Math.max(longest, current)
    current = 0
    lines += 1
    lineStart = true
  }
  for (const token of title.match(/\n|[^\S\n]+|[^\s]+/gu) ?? []) {
    if (token === '\n') {
      longest = Math.max(longest, current)
      current = 0
      gap = 0
      lines += 1
      lineStart = true
      continue
    }
    if (token.trim() === '') {
      if (!lineStart) gap += textWidth(token, fontSize)
      continue
    }
    const word = textWidth(token, fontSize)
    if (word > maxTextWidth) {
      if (!lineStart) endLine()
      gap = 0
      for (const character of token) {
        const width = advanceEm(character.codePointAt(0) ?? 0) * fontSize
        if (!lineStart && current + width > maxTextWidth) endLine()
        current += width
        lineStart = false
      }
      continue
    }
    if (!lineStart && current + gap + word > maxTextWidth) endLine()
    current += (lineStart ? 0 : gap) + word
    gap = 0
    lineStart = false
  }
  return { longestLine: Math.max(longest, current), lines }
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
  const { longestLine, lines } = measureTitleLines(title, maxTextWidth, fontSize)
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
        Math.max(isRoot ? 64 : 44, lines * Math.ceil(fontSize * LINE_HEIGHT) + TITLE_CHROME) +
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
