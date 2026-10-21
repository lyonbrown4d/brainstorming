import { expect, it } from 'vitest'
import { OrthographicCamera, Spherical, Vector3 } from 'three'
import {
  createSpatialCamera,
  projectSpatialPoint,
  spatialCameraDelta,
  spatialCameraQuaternion,
  unprojectSpatialPoint,
  type SpatialPoint3,
} from '@renderer/lib/spatialCamera'
import type { SpatialView } from '@renderer/state/spatialView'

const target = { x: 120, y: -70, z: 45 }
const point = { x: 270, y: 95, z: -30 }
const views: readonly SpatialView[] = [
  { mode: '3d', yaw: 0, pitch: 0, spacing: 100, target },
  { mode: '3d', yaw: Math.PI / 2, pitch: 0, spacing: 100, target },
  { mode: '3d', yaw: 0, pitch: Math.PI / 2, spacing: 100, target },
  { mode: '3d', yaw: 0.7, pitch: 1.35, spacing: 100, target },
  { mode: '3d', yaw: Math.PI, pitch: -0.4, spacing: 100, target },
]

const expectPointClose = (actual: SpatialPoint3, expected: SpatialPoint3): void => {
  expect(actual.x).toBeCloseTo(expected.x, 8)
  expect(actual.y).toBeCloseTo(expected.y, 8)
  expect(actual.z).toBeCloseTo(expected.z, 8)
}

it.each(views)('agrees with an independent Three camera matrix at yaw $yaw', (view) => {
  const physicalTarget = new Vector3(target.x, -target.y, target.z)
  const distance = 2000
  const eye = new Vector3().setFromSpherical(
    new Spherical(distance, Math.PI / 2 - view.pitch, view.yaw),
  )
  const reference = new OrthographicCamera(-1, 1, 1, -1, 0.1, 5000)
  reference.position.copy(physicalTarget).add(eye)
  if (view.pitch === Math.PI / 2) reference.up.set(0, 0, -1)
  reference.lookAt(physicalTarget)
  reference.updateMatrixWorld()
  const cameraPoint = new Vector3(point.x, -point.y, point.z).applyMatrix4(
    reference.matrixWorldInverse,
  )
  expectPointClose(projectSpatialPoint(point, view), {
    x: target.x + cameraPoint.x,
    y: target.y - cameraPoint.y,
    z: cameraPoint.z + distance,
  })
  const created = createSpatialCamera(view, distance)
  expect(created.position.distanceTo(reference.position)).toBeLessThan(1e-8)
  expect(created.quaternion.angleTo(reference.quaternion)).toBeLessThan(1e-8)
  expect(spatialCameraQuaternion(view).angleTo(reference.quaternion)).toBeLessThan(1e-8)
})

it.each(views)('round trips a canonical point at yaw $yaw', (view) => {
  expectPointClose(unprojectSpatialPoint(projectSpatialPoint(point, view), view), point)
})

it.each(views)('maps a screen drag to a depth-preserving world delta at yaw $yaw', (view) => {
  const drag = { x: 84, y: -53 }
  const delta = spatialCameraDelta(view, drag)
  const before = projectSpatialPoint(point, view)
  const after = projectSpatialPoint(
    { x: point.x + delta.x, y: point.y + delta.y, z: point.z + delta.z },
    view,
  )
  expectPointClose(after, { x: before.x + drag.x, y: before.y + drag.y, z: before.z })
})

it('keeps exact document coordinates in 2D', () => {
  const view: SpatialView = { mode: '2d', yaw: 0.9, pitch: 0.4, spacing: 100, target }
  expect(projectSpatialPoint(point, view)).toEqual(point)
  expect(unprojectSpatialPoint(point, view)).toEqual(point)
  expect(spatialCameraDelta(view, { x: 5, y: -3 })).toEqual({ x: 5, y: -3, z: 0 })
})
