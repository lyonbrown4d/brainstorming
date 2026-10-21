import { expect, it } from 'vitest'
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import { synchronizeSpatialBackdropCamera } from '@renderer/components/spatial/spatialBackdropCamera'
import { projectSpatialPoint } from '@renderer/lib/spatialCamera'
import { cameraViewport } from '@renderer/lib/spatialCameraNavigation'
import type { SpatialView } from '@renderer/state/spatialView'

it('keeps the ground camera aligned with the shared perspective editing projection', () => {
  const camera = new PerspectiveCamera()
  const size = { width: 1440, height: 900 }
  const target = { x: 225, y: 480, z: 20 }
  const view: SpatialView = {
    mode: '3d',
    yaw: 0.7,
    pitch: -0.4,
    spacing: 100,
    target,
    cameraDistance: 1800,
  }
  const viewport = cameraViewport(size, target, view.cameraDistance ?? 1800)
  viewport.x += 120
  viewport.y -= 50
  synchronizeSpatialBackdropCamera(camera, view, viewport, size)
  for (const point of [
    { x: 300, y: 200, z: 90 },
    { x: -120, y: 80, z: -100 },
  ]) {
    const projected = projectSpatialPoint(point, view)
    const screen = new Vector3(point.x, -point.y, point.z).project(camera)
    expect(((screen.x + 1) * size.width) / 2).toBeCloseTo(projected.x * viewport.zoom + viewport.x)
    expect(((1 - screen.y) * size.height) / 2).toBeCloseTo(projected.y * viewport.zoom + viewport.y)
  }
  synchronizeSpatialBackdropCamera(
    camera,
    { ...view, yaw: -0.8, cameraDistance: 2400 },
    viewport,
    size,
  )
  expect(camera.position.distanceTo(new Vector3(target.x, -target.y, target.z))).toBeCloseTo(2400)
  expect(camera.fov).toBe(42)
})

it('retains the rotated orthographic fallback when the render lens is not available', () => {
  const camera = new OrthographicCamera()
  const view: SpatialView = { mode: '3d', yaw: 0.7, pitch: 0.5, spacing: 100 }
  synchronizeSpatialBackdropCamera(
    camera,
    view,
    { x: 80, y: 90, zoom: 0.5 },
    { width: 1440, height: 900 },
  )
  expect(camera.left).toBe(-160)
  expect(camera.right).toBe(2720)
  expect(camera.position.length()).toBeCloseTo(10_000_000)
  expect(camera.quaternion.y).not.toBe(0)
})
