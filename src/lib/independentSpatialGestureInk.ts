import { Vector3, type PerspectiveCamera } from 'three'
import { INK_LIMITS, type CanvasPoint, type CanvasStroke } from '@core/ink'
import { inkGeometry } from '@shared/ink-geometry'
import {
  independentSpatialPointerPlane,
  type SpatialPointerPoint,
} from '@renderer/lib/independentSpatialGestureGeometry'
import type { SpatialSceneOffset } from '@renderer/lib/independentSpatialRuntime'

/** Ink coordinates describe the billboard plane; its center is placed in canonical world space. */
export const independentSpatialInkPlane = (
  camera: PerspectiveCamera,
  viewport: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  focus: SpatialSceneOffset,
) => {
  const plane = independentSpatialPointerPlane(camera, viewport, focus)
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const origin = new Vector3(focus.x, -focus.y, focus.z)
  return {
    point: (screen: SpatialPointerPoint, pressure: number): CanvasPoint | null => {
      const hit = plane(screen)
      if (!hit) return null
      const delta = new Vector3(hit.x, -hit.y, hit.z).sub(origin)
      return { x: delta.dot(right), y: -delta.dot(up), pressure }
    },
    stroke: (stroke: CanvasStroke): CanvasStroke | null => {
      const bounds = inkGeometry(stroke).bounds
      const x = bounds.x + bounds.width / 2,
        y = bounds.y + bounds.height / 2
      const center = origin.clone().addScaledVector(right, x).addScaledVector(up, -y)
      const points = stroke.points.map((point) => ({
        ...point,
        x: center.x + point.x - x,
        y: -center.y + point.y - y,
      }))
      if (
        !points.every(
          (point) =>
            Math.abs(point.x) <= INK_LIMITS.coordinate &&
            Math.abs(point.y) <= INK_LIMITS.coordinate,
        ) ||
        Math.abs(center.z) > INK_LIMITS.coordinate
      )
        return null
      return { ...stroke, points, spatialDepth: center.z }
    },
  }
}
