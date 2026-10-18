import { OUTLINE_WIDTH, INSPECTOR_WIDTH } from '@shared/workbench'
import { PerspectiveCamera, Vector3, type Camera } from 'three'

export interface ViewportBounds {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Panels cover the canvas without changing its renderer dimensions or camera projection. */
export const spatialSafeViewport = (
  viewport: ViewportBounds,
  outlineOpen: boolean,
  inspectorOpen: boolean,
): ViewportBounds => {
  const left = outlineOpen ? OUTLINE_WIDTH : 0
  const right = inspectorOpen ? INSPECTOR_WIDTH : 0
  const occupied = left + right
  const minimum = Math.min(80, viewport.width / 4)
  const scale = occupied ? Math.min(1, Math.max(0, viewport.width - minimum) / occupied) : 1
  return {
    left: viewport.left + left * scale,
    top: viewport.top,
    width: Math.max(minimum, viewport.width - occupied * scale),
    height: viewport.height,
  }
}

/** Place a fitted document at the visible center using a translation of the existing view. */
export const spatialFramingTarget = (
  camera: Camera,
  center: Vector3,
  distance: number,
  viewport: ViewportBounds,
  safe: ViewportBounds,
  direction?: Vector3,
): Vector3 => {
  if (!(camera instanceof PerspectiveCamera) || viewport.width <= 0 || viewport.height <= 0)
    return center.clone()
  const framed = camera.clone()
  const facing = direction?.clone().normalize() ?? camera.getWorldDirection(new Vector3()).negate()
  framed.aspect = viewport.width / viewport.height
  framed.position.copy(center).addScaledVector(facing, distance)
  framed.lookAt(center)
  framed.updateProjectionMatrix()
  framed.updateMatrixWorld()
  const depth = center.clone().project(framed).z
  const desired = new Vector3(
    ((safe.left + safe.width / 2 - viewport.left) / viewport.width) * 2 - 1,
    1 - ((safe.top + safe.height / 2 - viewport.top) / viewport.height) * 2,
    depth,
  ).unproject(framed)
  return center.clone().multiplyScalar(2).sub(desired)
}
