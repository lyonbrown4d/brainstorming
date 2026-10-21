import { type Camera, OrthographicCamera, PerspectiveCamera } from 'three'
import type { Viewport } from '@xyflow/react'
import { createSpatialCamera, spatialCameraQuaternion } from '@renderer/lib/spatialCamera'
import type { CameraSize } from '@renderer/lib/spatialCameraNavigation'
import type { SpatialView } from '@renderer/state/spatialView'

/** Mutate the external Three camera in place; React owns neither its pose nor its projection matrix. */
export const synchronizeSpatialBackdropCamera = (
  camera: Camera,
  view: SpatialView,
  viewport: Viewport,
  size: CameraSize,
): void => {
  const target = view.target ?? { x: 0, y: 0, z: 0 }
  const range = 10_000_000
  if (camera instanceof PerspectiveCamera && view.cameraDistance !== undefined) {
    const distance = view.cameraDistance
    camera.fov = 42
    camera.aspect = size.width / Math.max(size.height, 1)
    camera.near = 1
    camera.far = Math.max(range, distance * 3)
    const rotation = spatialCameraQuaternion(view)
    camera.position.set(0, 0, distance).applyQuaternion(rotation)
    camera.position.x += target.x
    camera.position.y -= target.y
    camera.position.z += target.z
    camera.quaternion.copy(rotation)
    camera.setViewOffset(
      size.width,
      size.height,
      size.width / 2 - (target.x * viewport.zoom + viewport.x),
      size.height / 2 - (target.y * viewport.zoom + viewport.y),
      size.width,
      size.height,
    )
  } else if (camera instanceof OrthographicCamera) {
    const next = createSpatialCamera(view, range)
    next.left = -viewport.x / viewport.zoom - target.x
    next.right = (size.width - viewport.x) / viewport.zoom - target.x
    next.top = viewport.y / viewport.zoom + target.y
    next.bottom = (viewport.y - size.height) / viewport.zoom + target.y
    next.updateProjectionMatrix()
    camera.copy(next)
  } else return
  camera.updateMatrixWorld()
}
