import type { IndependentMinimapGeometry } from '@renderer/lib/independentSpatialMinimapGeometry'

/** One Canvas2D bitmap keeps a large overview out of React and the main WebGL context. */
export const paintIndependentSpatialMinimap = (
  canvas: HTMLCanvasElement,
  geometry: IndependentMinimapGeometry,
  pixelRatio: number,
): void => {
  const context = canvas.getContext('2d')
  if (!context) return
  const ratio = Math.min(2, Math.max(1, pixelRatio))
  canvas.width = Math.round(geometry.width * ratio)
  canvas.height = Math.round(geometry.height * ratio)
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  const { snapshot, scale, x, y } = geometry
  context.fillStyle = snapshot.background
  context.fillRect(0, 0, geometry.width, geometry.height)
  for (const rect of [...snapshot.rectangles].sort((a, b) => b.depth - a.depth)) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) continue
    context.fillStyle = snapshot.colors.get(rect.id) ?? snapshot.foreground
    context.fillRect(
      x + rect.x * scale,
      y + rect.y * scale,
      Math.max(1, rect.width * scale),
      Math.max(1, rect.height * scale),
    )
  }
}
