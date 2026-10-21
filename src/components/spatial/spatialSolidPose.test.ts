import { expect, it } from 'vitest'
import { projectSpatialPoint, spatialPerspectiveScale } from '@renderer/lib/spatialCamera'
import { spatialSolidPose } from '@renderer/components/spatial/spatialSolidPose'
import type { SpatialView } from '@renderer/state/spatialView'

const base = { x: 200, y: 100, width: 240, height: 80 }
const canonical = { x: 320, y: 140, z: 120 }
const view = (cameraDistance: number): SpatialView => ({
  mode: '3d',
  yaw: 0.7,
  pitch: 0.5,
  spacing: 100,
  target: { x: 50, y: 20, z: 0 },
  cameraDistance,
})
const projected = (camera: SpatialView) => {
  const center = projectSpatialPoint(canonical, camera)
  const scale = spatialPerspectiveScale(camera, center.z)
  const width = base.width * scale
  const height = base.height * scale
  return { position: { x: center.x - width / 2, y: center.y - height / 2 }, width, height }
}

it('keeps canonical solid props identical throughout a pure camera dolly', () => {
  const first = spatialSolidPose(base, canonical.z, projected(view(1000)), view(1000))
  const nextProjection = projected(view(1600))
  const second = spatialSolidPose(
    base,
    canonical.z,
    {
      ...nextProjection,
      position: { x: nextProjection.position.x + 1e-10, y: nextProjection.position.y },
      width: nextProjection.width + 1e-10,
    },
    view(1600),
  )
  expect(first).toEqual({ ...canonical, width: base.width, height: base.height })
  expect(second).toEqual(first)

  // The editing node can be one React effect behind the current camera frame.
  const previousFrame = view(1000)
  const stale = projected(previousFrame)
  const pending = spatialSolidPose(
    base,
    canonical.z,
    {
      ...stale,
      width: Math.round(stale.width),
      height: Math.round(stale.height),
      widthTolerance: 0.5,
      heightTolerance: 0.5,
    },
    previousFrame,
  )
  expect(pending).toEqual(first)
})

it('keeps live drag and proportional resize aligned with the projected editor node', () => {
  const camera = view(1200)
  const original = projected(camera)
  const dragged = {
    ...original,
    position: { x: original.position.x + 32, y: original.position.y - 18 },
  }
  const dragPose = spatialSolidPose(base, canonical.z, dragged, camera)
  const dragScreen = projectSpatialPoint(dragPose, camera)
  expect(dragScreen.x).toBeCloseTo(projectSpatialPoint(canonical, camera).x + 32, 8)
  expect(dragScreen.y).toBeCloseTo(projectSpatialPoint(canonical, camera).y - 18, 8)
  expect(dragPose.width).toBe(base.width)

  const resized = { ...dragged, width: dragged.width * 1.25, height: dragged.height * 1.25 }
  const resizePose = spatialSolidPose(base, canonical.z, resized, camera)
  const resizeScale = spatialPerspectiveScale(camera, projectSpatialPoint(canonical, camera).z)
  const resizeScreen = projectSpatialPoint(resizePose, camera)
  expect(resizePose.width).toBeCloseTo(base.width * 1.25, 8)
  expect(resizePose.height).toBeCloseTo(base.height * 1.25, 8)
  expect(resizeScreen.x - (resizePose.width * resizeScale) / 2).toBeCloseTo(dragged.position.x, 8)
  expect(resizeScreen.y - (resizePose.height * resizeScale) / 2).toBeCloseTo(dragged.position.y, 8)
})
