import { getOverlappingArea, Position, type Rect } from '@xyflow/system'

export const TOPIC_NEARBY_GAP = 28
export const topicNearbySize = (root: boolean) => ({ width: root ? 38 : 70, height: 38 })

/** Nearby creation must leave neighboring topic bodies and both width grips accessible. */
export const topicNearbyPlacement = (
  topic: Rect,
  size: { readonly width: number; readonly height: number },
  obstacles: readonly Rect[],
  viewport: Rect,
): { readonly position: Position; readonly rectangle: Rect } | null => {
  const middleX = topic.x + (topic.width - size.width) / 2
  const middleY = topic.y + (topic.height - size.height) / 2
  const candidates = [
    { position: Position.Bottom, x: middleX, y: topic.y + topic.height + TOPIC_NEARBY_GAP },
    { position: Position.Top, x: middleX, y: topic.y - TOPIC_NEARBY_GAP - size.height },
    { position: Position.Right, x: topic.x + topic.width + TOPIC_NEARBY_GAP, y: middleY },
    { position: Position.Left, x: topic.x - TOPIC_NEARBY_GAP - size.width, y: middleY },
  ]
  for (const candidate of candidates) {
    const rectangle = { x: candidate.x, y: candidate.y, ...size }
    if (getOverlappingArea(rectangle, viewport) < size.width * size.height - 0.01) continue
    if (obstacles.some((obstacle) => getOverlappingArea(rectangle, obstacle) > 0)) continue
    return { position: candidate.position, rectangle }
  }
  return null
}
