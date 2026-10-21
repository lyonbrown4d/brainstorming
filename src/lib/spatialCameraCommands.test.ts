import { expect, it, vi } from 'vitest'
import { CameraControlsImpl } from '@react-three/drei'
import { Vector3 } from 'three'
import type { MindMapLayout } from '@layout'
import { cameraPositionFor } from '@renderer/lib/spatialCameraNavigation'
import {
  createSpatialPerspectiveCamera,
  spatialCameraSnapshot,
} from '@renderer/lib/spatialCameraController'
import {
  runSpatialCameraCommand,
  spatialCameraDefaultFrame,
  spatialCameraSceneSphere,
  spatialSceneResetDistance,
  type SpatialCameraScene,
} from '@renderer/lib/spatialCameraCommands'
import type { SpatialView } from '@renderer/state/spatialView'

const size = { width: 1200, height: 800 }
const layout: MindMapLayout = {
  nodes: [
    { id: 'root', x: -90, y: -35, width: 180, height: 70, side: 'right' },
    { id: 'child', x: 350, y: 180, width: 200, height: 90, side: 'right' },
  ],
  edges: [],
}
const scene: SpatialCameraScene = {
  layout,
  depths: { root: 0, child: 180 },
  drawings: [
    {
      id: 'ink',
      color: '#123456',
      width: 4,
      points: [
        { x: -450, y: 200, pressure: 0.5 },
        { x: -350, y: 230, pressure: 0.5 },
      ],
      spatialDepth: -100,
    },
  ],
  selectedId: 'child',
  rootId: 'root',
}
const view: SpatialView = { mode: '3d', yaw: 0.7, pitch: 0.5, spacing: 100 }

it('frames canonical 3D topics and ink with perspective-safe card corners', () => {
  const sphere = spatialCameraSceneSphere(scene)
  expect(sphere).not.toBeNull()
  if (!sphere) return
  expect(sphere.center.x).toBeLessThan(100)
  expect(sphere.center.z).toBe(40)
  expect(sphere.radius).toBeGreaterThan(350)
  const childCenter = new Vector3(450, -225, 180)
  expect(sphere.radius).toBeGreaterThanOrEqual(
    childCenter.distanceTo(sphere.center) + Math.hypot(200, 90) / 2,
  )
  const first = spatialCameraDefaultFrame(scene, view, size)
  expect(first.target).toEqual({ x: sphere.center.x, y: -sphere.center.y, z: sphere.center.z })
  expect(first.distance).toBeCloseTo(spatialSceneResetDistance(scene, size), 6)
  expect(first.distance).toBeGreaterThan(700)
  sphere.radius = 1
  expect(spatialCameraSceneSphere(scene)?.radius).toBeGreaterThan(350)
})

it('native fit, focus and dolly preserve orientation and use true camera distance', () => {
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
  const controls = new CameraControlsImpl(createSpatialPerspectiveCamera(size))
  try {
    void controls.setLookAt(
      ...cameraPositionFor({ ...view, target: { x: 0, y: 0, z: 0 } }, 1_500),
      false,
    )
    controls.update(1 / 60)
    expect(runSpatialCameraCommand(controls, 'fit', scene, size, false)).toBe(true)
    controls.update(1 / 60)
    const fitted = spatialCameraSnapshot(controls, view, size)
    expect(fitted.view.yaw).toBeCloseTo(view.yaw, 5)
    expect(fitted.view.pitch).toBeCloseTo(view.pitch, 5)
    expect(fitted.view.target?.z).toBeCloseTo(40, 5)

    expect(runSpatialCameraCommand(controls, 'focusSelected', scene, size, false)).toBe(true)
    controls.update(1 / 60)
    const focused = spatialCameraSnapshot(controls, view, size)
    expect(focused.view.target).toEqual({ x: 450, y: 225, z: 180 })
    expect(focused.distance).toBeCloseTo(fitted.distance, 5)
    expect(focused.view.yaw).toBeCloseTo(view.yaw, 5)

    expect(runSpatialCameraCommand(controls, 'zoomIn', scene, size, false)).toBe(true)
    controls.update(1 / 60)
    expect(spatialCameraSnapshot(controls, view, size).distance).toBeLessThan(focused.distance)
    expect(runSpatialCameraCommand(controls, 'actualSize', scene, size, false)).toBe(true)
    controls.update(1 / 60)
    expect(spatialCameraSnapshot(controls, view, size).distance).toBeCloseTo(
      spatialSceneResetDistance(scene, size),
      5,
    )
  } finally {
    controls.dispose()
    vi.unstubAllGlobals()
  }
})
