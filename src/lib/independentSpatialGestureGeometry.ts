import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three'
import type { SpatialSceneOffset, SpatialSceneRect } from '@renderer/lib/independentSpatialRuntime'

export interface SpatialPointerPoint {
  readonly x: number
  readonly y: number
}
export interface SpatialMarquee extends SpatialPointerPoint {
  readonly width: number
  readonly height: number
}

/** A fixed camera-facing plane keeps an off-centre grab stable under perspective. */
export const independentSpatialPointerPlane = (
  camera: PerspectiveCamera,
  viewport: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  center: SpatialSceneOffset,
) => {
  const normal = camera.getWorldDirection(new Vector3())
  const plane = new Plane().setFromNormalAndCoplanarPoint(
    normal,
    new Vector3(center.x, -center.y, center.z),
  )
  const ray = new Raycaster()
  return (point: SpatialPointerPoint): SpatialSceneOffset | null => {
    if (!viewport.width || !viewport.height) return null
    ray.setFromCamera(
      new Vector2(
        ((point.x - viewport.left) / viewport.width) * 2 - 1,
        1 - ((point.y - viewport.top) / viewport.height) * 2,
      ),
      camera,
    )
    const hit = ray.ray.intersectPlane(plane, new Vector3())
    return hit && [hit.x, hit.y, hit.z].every(Number.isFinite)
      ? { x: hit.x, y: -hit.y, z: hit.z }
      : null
  }
}

export const independentSpatialMarquee = (
  start: SpatialPointerPoint,
  end: SpatialPointerPoint,
): SpatialMarquee => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
})

export const independentSpatialMarqueeSelection = (
  rectangles: readonly SpatialSceneRect[],
  box: SpatialMarquee,
) => {
  const hits = rectangles.filter(
    (rect) =>
      rect.x <= box.x + box.width &&
      rect.x + rect.width >= box.x &&
      rect.y <= box.y + box.height &&
      rect.y + rect.height >= box.y,
  )
  return {
    topics: hits.filter((rect) => rect.kind === 'topic').map((rect) => rect.id),
    drawings: hits.filter((rect) => rect.kind === 'ink').map((rect) => rect.drawingId),
  }
}
