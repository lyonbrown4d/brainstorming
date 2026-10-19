import { getStroke } from 'perfect-freehand'
import type { CanvasStroke } from '@core/ink'

export interface InkBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}
const cache = new WeakMap<CanvasStroke, { path: string; bounds: InkBounds }>()

/** Cache only immutable strokes; pointer previews never retain document history. */
export const inkGeometry = (stroke: CanvasStroke): { path: string; bounds: InkBounds } => {
  const cached = cache.get(stroke)
  if (cached) return cached
  const transform = stroke.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1 }
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
  ).map((point) => ({
    x: point[0] * transform.scaleX + transform.x,
    y: point[1] * transform.scaleY + transform.y,
  }))
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const point of outline) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  const bounds = outline.length
    ? { x: minX, y: minY, width: Math.max(0.01, maxX - minX), height: Math.max(0.01, maxY - minY) }
    : { x: 0, y: 0, width: 1, height: 1 }
  const geometry = {
    bounds,
    path: outline.length ? `M${outline.map((point) => `${point.x},${point.y}`).join(' L')} Z` : '',
  }
  cache.set(stroke, geometry)
  return geometry
}

/** Compose an affine frame change; retain original pressure samples and exact ink shape. */
export const transformInk = (
  stroke: CanvasStroke,
  from: InkBounds,
  to: InkBounds,
): CanvasStroke => {
  const sx = to.width / from.width,
    sy = to.height / from.height
  if (sx === 1 && sy === 1 && from.x === to.x && from.y === to.y) return stroke
  const previous = stroke.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1 }
  return {
    ...stroke,
    transform: {
      x: to.x + (previous.x - from.x) * sx,
      y: to.y + (previous.y - from.y) * sy,
      scaleX: previous.scaleX * sx,
      scaleY: previous.scaleY * sy,
    },
  }
}
