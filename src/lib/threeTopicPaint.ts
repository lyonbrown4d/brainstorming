import { CanvasTextMetrics, TextStyle } from 'pixi.js'
import type { Topic } from '@core'
import type { SpatialSceneModel } from '@renderer/lib/independentSpatialRuntime'
import { topicAppearance } from '@shared/appearance'
import { topicShapeInsets, showsTopicNotes, topicNotesPreview } from '@shared/topic-shapes'
import { topicOutlinePath, visualPath } from '@shared/sketch'
import { measureTopicImage, measureTopicMarkers } from '@layout'
import { getAssetUrl } from '@renderer/lib/resource'
import { threeTopicTitleRuns, paintThreeTopicTitleLine } from '@renderer/lib/threeTopicRichText'
import { loadSceneImage } from '@renderer/lib/threeTopicImage'
import { markerMarkup } from '@renderer/export/markers'

const titleLines = (title: string, font: TextStyle, count: number): readonly string[] => {
  const lines = CanvasTextMetrics.measureText(title, font).lines
  if (lines.length <= count) return lines
  const last = CanvasTextMetrics.graphemeSegmenter(lines[count - 1] ?? '')
  while (
    last.length &&
    CanvasTextMetrics.measureText(`${last.join('')}…`, font).width > font.wordWrapWidth
  )
    last.pop()
  return [...lines.slice(0, count - 1), `${last.join('')}…`]
}

/** Paint once on content changes; perspective navigation never measures or paints text. */
export const paintThreeTopic = async (
  context: CanvasRenderingContext2D,
  model: SpatialSceneModel,
  topic: Topic,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<void> => {
  const cancelled = () => signal.aborted
  const appearance = topicAppearance(model.document, topic.id, model.surface)
  const shape = topic.style?.shape ?? 'rectangle'
  const scale = topic.style?.scale ?? 1
  const root = topic.id === model.document.rootId
  const branch = model.document.topics[model.document.rootId]?.children.includes(topic.id) ?? false
  const fontSize = (topic.style?.fontSize ?? (root ? 24 : 16)) * scale
  const insets = topicShapeInsets(shape)
  const left = width * insets.x + 16 * scale
  const top = height * insets.y + 10 * scale
  const contentWidth = Math.max(1, width - left * 2)
  if (shape !== 'text') {
    context.fillStyle = appearance.fill
    context.strokeStyle = appearance.stroke
    context.lineWidth = 1.5 * scale
    const outline = topicOutlinePath(shape, width, height)
    context.fill(new Path2D(outline))
    context.stroke(
      new Path2D(visualPath(outline, model.document.settings?.visualStyle, `topic:${topic.id}`)),
    )
    if (shape === 'card') {
      context.beginPath()
      context.moveTo(width * 0.08, height * 0.12)
      context.lineTo(width * 0.92, height * 0.12)
      context.stroke()
    }
  }
  const image = topic.image && model.document.assets?.[topic.image.assetId]
  const raster = image ? await loadSceneImage(getAssetUrl(image), signal) : null
  if (cancelled()) return
  const imageSize = topic.image ? measureTopicImage(topic.image) : null
  const markers = measureTopicMarkers(topic.metadata)
  const markerHeight = markers.extraHeight * scale
  let y = top + (markers.position === 'top' ? markerHeight : 0)
  if (raster && imageSize) {
    const ratio = Math.min(1, contentWidth / (imageSize.width * scale))
    const w = imageSize.width * scale * ratio,
      h = imageSize.height * scale * ratio
    context.drawImage(raster, (width - w) / 2, y, w, h)
    y += h + 10 * scale
  }
  const font = new TextStyle({
    fontFamily: appearance.fontFamily,
    fontSize,
    fontWeight: (topic.style?.bold ?? (root || branch)) ? '600' : '400',
    fontStyle: topic.style?.italic ? 'italic' : 'normal',
    wordWrap: true,
    wordWrapWidth: Math.max(1, contentWidth - markers.extraWidth * scale),
    breakWords: true,
    whiteSpace: 'pre',
  })
  const lines = titleLines(topic.title, font, 3)
  context.fillStyle = appearance.color
  context.font = `${font.fontStyle} ${font.fontWeight} ${fontSize}px ${appearance.fontFamily}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const hasDetails =
    Boolean(topic.notes) || Boolean(topic.attachments?.length) || Boolean(topic.metadata)
  if (!raster && !hasDetails && !markers.height)
    y = Math.max(y, (height - lines.length * fontSize * 1.5) / 2)
  const textX =
    width / 2 +
    (markers.position === 'left'
      ? (markers.extraWidth * scale) / 2
      : markers.position === 'right'
        ? (-markers.extraWidth * scale) / 2
        : 0)
  const runs = threeTopicTitleRuns(topic)
  let textOffset = 0
  for (const line of lines) {
    while (topic.title[textOffset] === '\n') textOffset++
    paintThreeTopicTitleLine(
      context,
      line,
      textOffset,
      runs,
      textX,
      y + fontSize * 0.75,
      contentWidth,
      fontSize,
      appearance.fontFamily,
      topic.style?.bold ?? (root || branch),
      topic.style?.italic ?? false,
    )
    textOffset += line.length
    y += fontSize * 1.5
  }
  context.font = `${12 * scale}px ${appearance.fontFamily}`
  if (showsTopicNotes(shape) && topic.notes) {
    context.globalAlpha = 0.72
    context.fillText(
      topicNotesPreview(topic.notes),
      width / 2,
      Math.min(height - top - 12 * scale, y + 14 * scale),
      contentWidth,
    )
    context.globalAlpha = 1
    y += 32 * scale
  }
  const metadata = topic.metadata
  const badges = [
    metadata?.task?.priority ? `${metadata.task.priority}` : '',
    metadata?.task
      ? `${metadata.task.done ? '✓' : '○'}${metadata.task.progress !== undefined ? ` ${metadata.task.progress}%` : ''}`
      : '',
    metadata?.labels?.join(' · '),
    metadata?.link ? '↗' : '',
    metadata?.equation ? 'Σ' : '',
    metadata?.audioAssetId ? '♫' : '',
    topic.notes ? '≡' : '',
    topic.attachments?.length ? `⌕ ${topic.attachments.length}` : '',
  ]
    .filter(Boolean)
    .join('  ')
  if (badges)
    context.fillText(
      badges,
      width / 2,
      Math.min(height - top - markerHeight, y + 14 * scale),
      contentWidth,
    )
  const markerList = metadata?.markers?.slice(0, 4) ?? []
  let mx =
    markers.position === 'left'
      ? left
      : markers.position === 'right'
        ? width - left - markers.width * scale
        : (width - markers.width * scale) / 2
  const my =
    markers.position === 'top'
      ? top
      : markers.position === 'bottom'
        ? height - top - markers.size * scale
        : (height - markers.size * scale) / 2
  for (const marker of markerList) {
    const svg = markerMarkup(marker, appearance.color, markers.size * scale)
    const icon = await loadSceneImage(`data:image/svg+xml,${encodeURIComponent(svg)}`, signal)
    if (cancelled()) return
    if (icon) context.drawImage(icon, mx, my, markers.size * scale, markers.size * scale)
    mx += (markers.size + 4) * scale
  }
}
