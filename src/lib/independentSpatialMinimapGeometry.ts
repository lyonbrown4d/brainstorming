import type { SpatialSceneRect } from '@renderer/lib/independentSpatialRuntime'

export interface IndependentMinimapBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}
export interface IndependentMinimapSnapshot {
  readonly rectangles: readonly SpatialSceneRect[]
  readonly viewport: IndependentMinimapBounds
  readonly colors: ReadonlyMap<string, string>
  readonly background: string
  readonly foreground: string
}
export interface IndependentMinimapGeometry {
  readonly snapshot: IndependentMinimapSnapshot
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly x: number
  readonly y: number
}

/** Include the real canvas viewport and offscreen projected topics in one aspect-preserving overview. */
export const independentSpatialMinimapGeometry = (
  snapshot: IndependentMinimapSnapshot,
  width: number,
  height: number,
): IndependentMinimapGeometry | null => {
  const rectangles = [snapshot.viewport, ...snapshot.rectangles]
  if (width <= 16 || height <= 16 || ![width, height].every(Number.isFinite)) return null
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity
  for (const rect of rectangles) {
    if (
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      rect.width <= 0 ||
      rect.height <= 0
    )
      continue
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  if (!Number.isFinite(left) || right <= left || bottom <= top) return null
  const scale = Math.min((width - 16) / (right - left), (height - 16) / (bottom - top))
  return {
    snapshot,
    width,
    height,
    scale,
    x: (width - (right - left) * scale) / 2 - left * scale,
    y: (height - (bottom - top) * scale) / 2 - top * scale,
  }
}

/** Navigate from the painted snapshot, with frontmost hits winning and ink excluded as a camera target. */
export const independentSpatialMinimapTopic = (
  geometry: IndependentMinimapGeometry,
  point: { readonly x: number; readonly y: number },
): string | null => {
  const x = (point.x - geometry.x) / geometry.scale
  const y = (point.y - geometry.y) / geometry.scale
  if (![x, y].every(Number.isFinite)) return null
  let nearest: SpatialSceneRect | null = null
  let distance = Infinity
  for (const rect of geometry.snapshot.rectangles) {
    if (
      rect.kind !== 'topic' ||
      ![rect.x, rect.y, rect.width, rect.height, rect.depth].every(Number.isFinite)
    )
      continue
    const dx = Math.max(rect.x - x, 0, x - rect.x - rect.width)
    const dy = Math.max(rect.y - y, 0, y - rect.y - rect.height)
    const next = dx * dx + dy * dy
    if (next < distance || (next === distance && rect.depth < (nearest?.depth ?? Infinity))) {
      nearest = rect
      distance = next
    }
  }
  return nearest?.id ?? null
}
