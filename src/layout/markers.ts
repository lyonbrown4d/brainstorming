import type { TopicMetadata } from '@core'
/** Shared bounds for canvas cards and exported icons. Legacy documents keep bottom placement. */
export const measureTopicMarkers = (metadata?: TopicMetadata) => {
  const count = metadata?.markers?.length ?? 0
  const size = metadata?.markerStyle?.size ?? 16
  const position = metadata?.markerStyle?.position ?? 'bottom'
  const width = count ? Math.min(4, count) * (size + 4) - 4 + (count > 4 ? 28 : 0) : 0
  const height = count ? size : 0
  const horizontal = position === 'left' || position === 'right'
  return {
    size,
    position,
    width,
    height,
    extraWidth: horizontal && count ? width + 60 : 0,
    extraHeight: !horizontal && count ? height + 24 : 0,
  }
}
