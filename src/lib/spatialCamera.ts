import { OrthographicCamera, Quaternion, Vector3 } from 'three'
import type { SpatialView } from '@renderer/state/spatialView'

export interface SpatialPoint3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

type CameraView = SpatialView & { readonly target?: SpatialPoint3 }
interface CameraFrame {
  readonly target: Vector3
  readonly right: Vector3
  readonly up: Vector3
  readonly forward: Vector3
  readonly rotation: Quaternion
}

const ORIGIN: SpatialPoint3 = Object.freeze({ x: 0, y: 0, z: 0 })
const WORLD_UP = new Vector3(0, 1, 0)
const WORLD_RIGHT = new Vector3(1, 0, 0)
const WORLD_FORWARD = new Vector3(0, 0, 1)
const frames = new WeakMap<CameraView, CameraFrame>()

/** Camera local +Z points from the target toward the eye. */
const frameFor = (view: CameraView): CameraFrame => {
  const cached = frames.get(view)
  if (cached) return cached
  const target = view.target ?? ORIGIN
  const rotation = new Quaternion()
    .setFromAxisAngle(WORLD_UP, view.mode === '2d' ? 0 : view.yaw)
    .multiply(new Quaternion().setFromAxisAngle(WORLD_RIGHT, view.mode === '2d' ? 0 : -view.pitch))
  const frame: CameraFrame = {
    target: new Vector3(target.x, -target.y, target.z),
    right: WORLD_RIGHT.clone().applyQuaternion(rotation),
    up: WORLD_UP.clone().applyQuaternion(rotation),
    forward: WORLD_FORWARD.clone().applyQuaternion(rotation),
    rotation,
  }
  frames.set(view, frame)
  return frame
}

/** Camera-local rotation in physical Three coordinates: (x, -y, z). */
export const spatialCameraQuaternion = (view: CameraView): Quaternion =>
  frameFor(view).rotation.clone()

/** Orthographic camera centered on the logical target, useful for 3D rendering. */
export const createSpatialCamera = (view: CameraView, distance: number): OrthographicCamera => {
  const frame = frameFor(view)
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, Math.max(2, distance * 4))
  camera.position.copy(frame.target).addScaledVector(frame.forward, distance)
  camera.quaternion.copy(frame.rotation)
  camera.updateMatrixWorld()
  return camera
}

/** Screen x/y keep logical canvas units; z is displacement toward the eye. */
export const projectSpatialPoint = (point: SpatialPoint3, view: CameraView): SpatialPoint3 => {
  if (view.mode === '2d') return { ...point }
  const { target, right, up, forward } = frameFor(view)
  const dx = point.x - target.x
  const dy = -point.y - target.y
  const dz = point.z - target.z
  return {
    x: target.x + dx * right.x + dy * right.y + dz * right.z,
    y: -target.y - (dx * up.x + dy * up.y + dz * up.z),
    z: dx * forward.x + dy * forward.y + dz * forward.z,
  }
}

/** Inverse of projectSpatialPoint at a known camera-relative depth. */
export const unprojectSpatialPoint = (point: SpatialPoint3, view: CameraView): SpatialPoint3 => {
  if (view.mode === '2d') return { ...point }
  const { target, right, up, forward } = frameFor(view)
  const x = point.x - target.x
  const y = -point.y - target.y
  const z = point.z
  return {
    x: target.x + x * right.x + y * up.x + z * forward.x,
    y: -target.y - (x * right.y + y * up.y + z * forward.y),
    z: target.z + x * right.z + y * up.z + z * forward.z,
  }
}

/** World translation matching a screen drag in the camera's image plane. */
export const spatialCameraDelta = (
  view: CameraView,
  delta: { readonly x: number; readonly y: number },
): SpatialPoint3 => {
  if (view.mode === '2d') return { ...delta, z: 0 }
  const { right, up } = frameFor(view)
  return {
    x: delta.x * right.x - delta.y * up.x,
    y: -delta.x * right.y + delta.y * up.y,
    z: delta.x * right.z - delta.y * up.z,
  }
}
