import { expect, it, vi } from 'vitest'
import { CameraControlsImpl } from '@react-three/drei'
import { PerspectiveCamera, Vector3 } from 'three'
import {
  cameraDistanceFromViewport,
  cameraOrientation,
  cameraPositionFor,
  cameraTargetFromViewport,
  cameraViewport,
  spatialCameraWheel,
} from '@renderer/lib/spatialCameraNavigation'
import { projectSpatialPoint } from '@renderer/lib/spatialCamera'
import {
  applySpatialCameraWheel,
  spatialCameraSnapshot,
} from '@renderer/lib/spatialCameraController'
import type { SpatialView } from '@renderer/state/spatialView'

const size = { width: 1200, height: 800 }
const wheel = {
  deltaX: 12,
  deltaY: -20,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
}

it('maps trackpad scroll, pinch and Alt-scroll to distinct camera actions', () => {
  expect(spatialCameraWheel(wheel, size)).toEqual({ kind: 'truck', x: 12, y: -20 })
  expect(spatialCameraWheel({ ...wheel, ctrlKey: true }, size)).toEqual({ kind: 'dolly', y: -20 })
  expect(spatialCameraWheel({ ...wheel, metaKey: true }, size)).toEqual({ kind: 'dolly', y: -20 })
  expect(spatialCameraWheel({ ...wheel, altKey: true }, size)).toEqual({
    kind: 'rotate',
    x: 12,
    y: -20,
  })
  expect(spatialCameraWheel({ ...wheel, deltaX: 0, shiftKey: true }, size)).toEqual({
    kind: 'truck',
    x: -20,
    y: 0,
  })
  expect(spatialCameraWheel({ ...wheel, deltaMode: 1 }, size)).toEqual({
    kind: 'truck',
    x: 192,
    y: -240,
  })
  expect(spatialCameraWheel({ ...wheel, deltaY: Number.NaN }, size)).toBeNull()
})

it('accumulates rapid pinch zoom against the native goal before damping catches up', () => {
  vi.stubGlobal(
    'DOMRect',
    class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
      ) {}
    },
  )
  const controls = new CameraControlsImpl(new PerspectiveCamera(42, 1.5, 0.1, 10_000_000))
  try {
    const distance = 1_000
    const view: SpatialView = { mode: '3d', yaw: 0.7, pitch: 0.5, spacing: 100 }
    void controls.setLookAt(...cameraPositionFor(view, distance), false)
    controls.update(1 / 60)
    applySpatialCameraWheel(controls, { kind: 'dolly', y: -100 }, distance, 800)
    applySpatialCameraWheel(controls, { kind: 'dolly', y: -100 }, distance, 800)
    const goal = controls
      .getPosition(new Vector3(), true)
      .distanceTo(controls.getTarget(new Vector3(), true))
    expect(goal).toBeCloseTo(distance * Math.exp(-1.6), 5)
  } finally {
    controls.dispose()
    vi.unstubAllGlobals()
  }
})

it('round trips pose and viewport through the perspective camera', () => {
  const view: SpatialView = {
    mode: '3d',
    yaw: 1.12,
    pitch: 0.47,
    spacing: 100,
    target: { x: 125, y: -42, z: 65 },
  }
  const target = view.target ?? { x: 0, y: 0, z: 0 }
  const distance = cameraDistanceFromViewport(size.height, 1.3)
  const [x, y, z, tx, ty, tz] = cameraPositionFor(view, distance)
  const orientation = cameraOrientation({ x, y, z }, { x: tx, y: ty, z: tz })
  expect(orientation.yaw).toBeCloseTo(view.yaw, 8)
  expect(orientation.pitch).toBeCloseTo(view.pitch, 8)
  const viewport = cameraViewport(size, target, distance)
  expect(viewport.zoom).toBeCloseTo(1.3, 8)
  const recovered = cameraTargetFromViewport(size, viewport, target.z, view)
  expect(recovered.x).toBeCloseTo(target.x, 8)
  expect(recovered.y).toBeCloseTo(target.y, 8)
  expect(recovered.z).toBeCloseTo(target.z, 8)
  const movedViewport = { ...viewport, x: viewport.x + 80, y: viewport.y - 45 }
  const moved = cameraTargetFromViewport(size, movedViewport, target.z, view)
  const projected = projectSpatialPoint(moved, view)
  expect(projected.x).toBeCloseTo((size.width / 2 - movedViewport.x) / movedViewport.zoom, 8)
  expect(projected.y).toBeCloseTo((size.height / 2 - movedViewport.y) / movedViewport.zoom, 8)
})

it('recalibrates the RF viewport to a resized perspective camera', () => {
  const target = { x: 120, y: -40, z: 30 }
  const distance = cameraDistanceFromViewport(size.height, 1)
  const taller = { width: size.width, height: 1000 }
  const resized = cameraViewport(taller, target, distance)
  expect(resized.zoom).toBeCloseTo(taller.height / size.height, 8)
  expect((taller.width / 2 - resized.x) / resized.zoom).toBeCloseTo(target.x, 8)
  expect((taller.height / 2 - resized.y) / resized.zoom).toBeCloseTo(target.y, 8)
})

it('reads the installed CameraControls target and distance as the render pose', () => {
  vi.stubGlobal(
    'DOMRect',
    class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
      ) {}
    },
  )
  const camera = new PerspectiveCamera(42, size.width / size.height, 0.1, 10_000_000)
  const controls = new CameraControlsImpl(camera)
  const distance = cameraDistanceFromViewport(size.height, 1.2)
  const view: SpatialView = { mode: '3d', yaw: 0.6, pitch: 0.4, spacing: 100 }
  void controls.setLookAt(
    ...cameraPositionFor({ ...view, target: { x: 85, y: -40, z: 30 } }, distance),
    false,
  )
  controls.update(1 / 60)
  const snapshot = spatialCameraSnapshot(controls, view, size)
  expect(snapshot.view.yaw).toBe(view.yaw)
  expect(snapshot.view.pitch).toBe(view.pitch)
  expect(snapshot.view.target).toEqual({ x: 85, y: -40, z: 30 })
  expect(snapshot.distance).toBeCloseTo(distance, 6)
  expect(snapshot.viewport.zoom).toBeCloseTo(1.2, 6)
  void controls.dollyTo(distance * 0.8, false)
  controls.update(1 / 60)
  const zoomed = spatialCameraSnapshot(controls, snapshot.view, size)
  expect(zoomed.view.yaw).toBe(view.yaw)
  expect(zoomed.view.pitch).toBe(view.pitch)
  expect(zoomed.distance).toBeLessThan(snapshot.distance)
  void controls.rotate(0.2, 0.1, false)
  controls.update(1 / 60)
  const orbited = spatialCameraSnapshot(controls, zoomed.view, size)
  expect(orbited.view.yaw).not.toBe(view.yaw)
  expect(orbited.view.pitch).not.toBe(view.pitch)
  controls.dispose()
  vi.unstubAllGlobals()
})
