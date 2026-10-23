import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three'
import type { CanvasStroke } from '@core'
import { validateCanvasStroke } from '@core/ink'
import { transformInk, type InkBounds } from '@shared/ink-geometry'

export type SpatialInkCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** Keep the opposite screen corner and persisted depth fixed, including oblique camera views. */
export const independentSpatialInkResize = (
  camera: PerspectiveCamera,
  viewport: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  original: InkBounds,
  corner: SpatialInkCorner,
  pointer: { readonly x: number; readonly y: number },
  depth: number,
): InkBounds | null => {
  const left = corner.endsWith('left'),
    top = corner.startsWith('top')
  const fixed = {
    x: original.x + (left ? original.width : 0),
    y: original.y + (top ? original.height : 0),
  }
  const width = Math.max(12, (pointer.x - fixed.x) * (left ? -1 : 1))
  const height = Math.max(12, (pointer.y - fixed.y) * (top ? -1 : 1))
  const x = fixed.x + (left ? -width : 0),
    y = fixed.y + (top ? -height : 0)
  if (viewport.width <= 0 || viewport.height <= 0) return null
  const ray = new Raycaster()
  ray.setFromCamera(
    new Vector2(
      ((x + width / 2 - viewport.left) / viewport.width) * 2 - 1,
      1 - ((y + height / 2 - viewport.top) / viewport.height) * 2,
    ),
    camera,
  )
  const center = ray.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -depth), new Vector3())
  if (!center) return null
  const cameraDepth = -center.clone().applyMatrix4(camera.matrixWorldInverse).z
  const px = camera.projectionMatrix.elements[0],
    py = camera.projectionMatrix.elements[5]
  if (!px || !py || cameraDepth <= camera.near || cameraDepth >= camera.far) return null
  const worldWidth = (width * 2 * cameraDepth) / (px * viewport.width)
  const worldHeight = (height * 2 * cameraDepth) / (py * viewport.height)
  const bounds = {
    x: center.x - worldWidth / 2,
    y: -center.y - worldHeight / 2,
    width: worldWidth,
    height: worldHeight,
  }
  return Object.values(bounds).every(Number.isFinite) ? bounds : null
}

export const independentSpatialResizedStroke = (
  stroke: CanvasStroke,
  original: InkBounds,
  target: InkBounds,
): CanvasStroke | null => {
  try {
    const next = transformInk(stroke, original, target)
    validateCanvasStroke(next)
    return next
  } catch {
    return null
  }
}
