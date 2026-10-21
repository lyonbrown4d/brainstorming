import { CameraControlsImpl } from '@react-three/drei'
import {
  Box3,
  MathUtils,
  Matrix4,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import { PerspectiveCamera } from 'three'
import {
  setSpatialSceneDistanceLimits,
  type SpatialCameraScene,
} from '@renderer/lib/spatialCameraCommands'
import {
  cameraDistanceFromViewport,
  cameraOrientation,
  cameraPositionFor,
  cameraViewport,
  type CameraWheelAction,
  type CameraSize,
} from '@renderer/lib/spatialCameraNavigation'
import type { SpatialView } from '@renderer/state/spatialView'
import { publishSpatialNavigationFrame } from '@renderer/state/spatialNavigation'
import type { Viewport } from '@xyflow/react'

CameraControlsImpl.install({
  THREE: {
    Box3,
    MathUtils,
    Matrix4,
    Quaternion,
    Raycaster,
    Sphere,
    Spherical,
    Vector2,
    Vector3,
    Vector4,
  },
})

/** Match the direct manipulation of the original 3D workspace. */
export const createSpatialControls = (
  camera: PerspectiveCamera,
  element: HTMLElement,
  reducedMotion: boolean,
): CameraControlsImpl => {
  const controls = new CameraControlsImpl(camera)
  controls.smoothTime = reducedMotion ? 0 : 0.18
  controls.draggingSmoothTime = reducedMotion ? 0 : 0.126
  controls.minDistance = 1
  controls.maxDistance = 1_000_000
  controls.minPolarAngle = 0
  controls.maxPolarAngle = Math.PI
  controls.truckSpeed = 2
  controls.mouseButtons = {
    left: CameraControlsImpl.ACTION.ROTATE,
    right: CameraControlsImpl.ACTION.NONE,
    middle: CameraControlsImpl.ACTION.DOLLY,
    wheel: CameraControlsImpl.ACTION.NONE,
  }
  controls.touches = {
    one: CameraControlsImpl.ACTION.TOUCH_ROTATE,
    two: CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK,
    three: CameraControlsImpl.ACTION.TOUCH_TRUCK,
  }
  controls.connect(element)
  return controls
}

export const createSpatialPerspectiveCamera = (size: CameraSize): PerspectiveCamera =>
  new PerspectiveCamera(42, size.width / size.height, 0.1, 10_000_000)

export const setSpatialCameraZoomLimits = (controls: CameraControlsImpl, height: number): void => {
  controls.minDistance = cameraDistanceFromViewport(height, 2)
  controls.maxDistance = cameraDistanceFromViewport(height, 0.15)
}

export const spatialCameraSnapshot = (
  controls: CameraControlsImpl,
  view: SpatialView,
  size: CameraSize,
  end = false,
): { view: SpatialView; distance: number; viewport: ReturnType<typeof cameraViewport> } => {
  const position = controls.getPosition(new Vector3(), end)
  const physicalTarget = controls.getTarget(new Vector3(), end)
  const target = { x: physicalTarget.x, y: -physicalTarget.y, z: physicalTarget.z }
  const distance = position.distanceTo(physicalTarget)
  return {
    view: { ...view, ...cameraOrientation(position, physicalTarget), target },
    distance,
    viewport: cameraViewport(size, target, distance),
  }
}

/** Publish one native pose to the render lens and the shared editing viewport. */
export const publishSpatialCameraSnapshot = (
  controls: CameraControlsImpl,
  view: SpatialView,
  size: CameraSize,
  workbookId: string,
  sheetId: string,
  setViewport: (viewport: Viewport) => void,
): ReturnType<typeof spatialCameraSnapshot> => {
  const snapshot = spatialCameraSnapshot(controls, view, size)
  publishSpatialNavigationFrame(
    workbookId,
    sheetId,
    snapshot.view,
    snapshot.distance,
    snapshot.viewport,
  )
  setViewport(snapshot.viewport)
  return snapshot
}

export const freezeSpatialControls = (
  controls: CameraControlsImpl,
  view: SpatialView,
  size: CameraSize,
): ReturnType<typeof spatialCameraSnapshot> => {
  const snapshot = spatialCameraSnapshot(controls, view, size)
  void controls.setLookAt(...cameraPositionFor(snapshot.view, snapshot.distance), false)
  return snapshot
}

export const truckSpatialCameraPixels = (
  controls: CameraControlsImpl,
  distance: number,
  height: number,
  deltaX: number,
  deltaY: number,
): void => {
  const unit = (distance * 2 * Math.tan((Math.PI * 21) / 180)) / height
  void controls.truck(-deltaX * unit, deltaY * unit, true)
}

export const applySpatialCameraWheel = (
  controls: CameraControlsImpl,
  action: CameraWheelAction,
  distance: number,
  height: number,
): void => {
  const unit = (distance * 2 * Math.tan((Math.PI * 21) / 180)) / height
  if (action.kind === 'truck') void controls.truck(action.x * unit, -action.y * unit, true)
  else if (action.kind === 'dolly') {
    const goal = controls
      .getPosition(new Vector3(), true)
      .distanceTo(controls.getTarget(new Vector3(), true))
    void controls.dollyTo(goal * Math.exp(action.y * 0.002), true)
  } else void controls.rotate(action.x * 0.003, action.y * 0.003, true)
}

/** Keep the projection and adapter calibrated when only the pane dimensions change. */
export const observeSpatialCameraSize = (
  root: HTMLElement,
  camera: PerspectiveCamera,
  controls: CameraControlsImpl,
  scene: () => SpatialCameraScene,
  distance: () => number,
  applyDistance: (distance: number) => void,
  publish: () => void,
): (() => void) => {
  const observer = new ResizeObserver(() => {
    const width = root.clientWidth
    const height = root.clientHeight
    if (width <= 0 || height <= 0) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    setSpatialSceneDistanceLimits(controls, scene())
    const bounded = Math.min(controls.maxDistance, Math.max(controls.minDistance, distance()))
    if (bounded !== distance()) applyDistance(bounded)
    publish()
  })
  observer.observe(root)
  return () => {
    observer.disconnect()
  }
}
