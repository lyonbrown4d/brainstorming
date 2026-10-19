import { getStroke } from 'perfect-freehand'
import type { CanvasStroke } from '@core/ink'

const pathCache = new WeakMap<CanvasStroke, string>()

/** One freehand geometry implementation serves live SVG and document exports. */
export const canvasStrokePath = (stroke: CanvasStroke): string => {
  const cached = pathCache.get(stroke)
  if (cached !== undefined) return cached
  const outline = getStroke(
    stroke.points.map((point) => [point.x, point.y, point.pressure]),
    {
      size: stroke.width,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: false,
      last: true,
    },
  )
  const path = outline.length
    ? `M${outline.map((point) => `${point[0]},${point[1]}`).join(' L')} Z`
    : ''
  pathCache.set(stroke, path)
  return path
}
