import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { makeSpatialSolidGeometry } from '@renderer/components/spatial/spatialSolidGeometry'
import { spatialSolidMatrix } from '@renderer/components/spatial/spatialSolidTransform'
import {
  projectSpatialPoint,
  spatialCameraQuaternion,
  spatialPerspectiveScale,
  unprojectSpatialPoint,
} from '@renderer/lib/spatialCamera'
import type { SpatialView } from '@renderer/state/spatialView'

const worldPoint = (
  view: SpatialView,
  matrix: ReturnType<typeof spatialSolidMatrix>,
  x: number,
  y: number,
  z: number,
) => new Vector3(x, y, z).applyMatrix4(matrix).applyQuaternion(spatialCameraQuaternion(view))

const canvasPoint = (
  view: SpatialView,
  matrix: ReturnType<typeof spatialSolidMatrix>,
  x: number,
  y: number,
  z: number,
) => {
  const world = worldPoint(view, matrix, x, y, z)
  return projectSpatialPoint({ x: world.x, y: -world.y, z: world.z }, view)
}

const view = (yaw: number, pitch: number): SpatialView => ({
  mode: '3d',
  yaw,
  pitch,
  spacing: 100,
})

it.each([view(0.7, 0.5), view(Math.PI / 2, 0), view(0, Math.PI / 2), view(Math.PI, 0)])(
  'keeps the billboard front corners aligned at yaw=$yaw pitch=$pitch',
  (camera) => {
    const scale = 1.4
    const thickness = 22
    const left = -120
    const top = -40
    const matrix = spatialSolidMatrix(camera, { x: left, y: top, z: 0, scale, thickness })
    const first = canvasPoint(camera, matrix, 0, 0, thickness)
    const last = canvasPoint(camera, matrix, 240 / scale, 80 / scale, thickness)
    expect(first.x).toBeCloseTo(left, 8)
    expect(first.y).toBeCloseTo(top, 8)
    expect(last.x).toBeCloseTo(left + 240, 8)
    expect(last.y).toBeCloseTo(top + 80, 8)
    for (const number of [first.x, first.y, first.z, last.x, last.y, last.z])
      expect(Number.isFinite(number)).toBe(true)
  },
)

it('moves the back cap across the screen for angled and side cameras', () => {
  for (const camera of [view(0.7, 0.5), view(Math.PI / 2, 0), view(0, Math.PI / 2)]) {
    const matrix = spatialSolidMatrix(camera, {
      x: -120,
      y: -40,
      z: 0,
      scale: 1,
      thickness: 22,
    })
    const front = canvasPoint(camera, matrix, 0, 0, 22)
    const back = canvasPoint(camera, matrix, 0, 0, 0)
    const worldOffset = worldPoint(camera, matrix, 0, 0, 0).sub(
      worldPoint(camera, matrix, 0, 0, 22),
    )
    expect(Math.hypot(back.x - front.x, back.y - front.y)).toBeGreaterThan(1)
    expect(back.z).toBeLessThanOrEqual(front.z + 1e-8)
    expect(worldOffset.x).toBeCloseTo(0, 8)
    expect(worldOffset.y).toBeCloseTo(0, 8)
    expect(worldOffset.z).toBeCloseTo(-22, 8)
  }
})

it('assigns cap and side faces to separate materials', () => {
  const geometry = makeSpatialSolidGeometry('rounded', 240, 80, 22)
  expect(new Set(geometry.groups.map((group) => group.materialIndex))).toEqual(new Set([0, 1]))
  geometry.dispose()
})

it('has a finite back cap in front and rear polar views', () => {
  for (const camera of [view(0, 0), view(Math.PI, 0), view(0, -Math.PI / 2)]) {
    const matrix = spatialSolidMatrix(camera, { x: 0, y: 0, z: 0, scale: 1, thickness: 22 })
    const front = canvasPoint(camera, matrix, 0, 0, 22)
    const back = canvasPoint(camera, matrix, 0, 0, 0)
    expect(Number.isFinite(back.x + back.y + back.z)).toBe(true)
    expect(Number.isFinite(front.x + front.y + front.z)).toBe(true)
  }
})

it('aligns the front silhouette with a perspective-scaled shared editor topic', () => {
  const camera: SpatialView = { ...view(0.7, 0.5), cameraDistance: 1400 }
  const canonicalCenter = { x: 320, y: 160, z: 120 }
  const projectedCenter = projectSpatialPoint(canonicalCenter, camera)
  const actualCenter = unprojectSpatialPoint(projectedCenter, camera)
  const scale = spatialPerspectiveScale(camera, projectedCenter.z)
  const width = 240
  const height = 80
  const projectedWidth = width * scale
  const projectedHeight = height * scale
  const thickness = 22
  const matrix = spatialSolidMatrix(camera, {
    x: -projectedWidth / (2 * scale),
    y: -projectedHeight / (2 * scale),
    z: 0,
    scale: 1,
    scaleX: projectedWidth / (width * scale),
    scaleY: projectedHeight / (height * scale),
    thickness,
  })
  const center = new Vector3(actualCenter.x, -actualCenter.y, actualCenter.z)
  const projectCorner = (x: number, y: number) => {
    const world = worldPoint(camera, matrix, x, y, thickness).add(center)
    return projectSpatialPoint({ x: world.x, y: -world.y, z: world.z }, camera)
  }
  const topLeft = projectCorner(0, 0)
  const bottomRight = projectCorner(width, height)
  expect(topLeft.x).toBeCloseTo(projectedCenter.x - projectedWidth / 2, 8)
  expect(topLeft.y).toBeCloseTo(projectedCenter.y - projectedHeight / 2, 8)
  expect(bottomRight.x).toBeCloseTo(projectedCenter.x + projectedWidth / 2, 8)
  expect(bottomRight.y).toBeCloseTo(projectedCenter.y + projectedHeight / 2, 8)
})

it('resizes a draft with a matrix while keeping the canonical geometry dimensions', () => {
  const camera: SpatialView = { ...view(0.7, 0.5), cameraDistance: 1400 }
  const width = 240
  const height = 80
  const projectedWidth = 315
  const projectedHeight = 105
  const perspectiveScale = 1.2
  const geometry = makeSpatialSolidGeometry('rounded', width, height, 16)
  const matrix = spatialSolidMatrix(camera, {
    x: -projectedWidth / (2 * perspectiveScale),
    y: -projectedHeight / (2 * perspectiveScale),
    z: 0,
    scale: 1,
    scaleX: projectedWidth / (width * perspectiveScale),
    scaleY: projectedHeight / (height * perspectiveScale),
    thickness: 16,
  })
  const front = new Vector3(width, height, 16).applyMatrix4(matrix)
  expect(front.x).toBeCloseTo(projectedWidth / (2 * perspectiveScale), 8)
  expect(front.y).toBeCloseTo(-projectedHeight / (2 * perspectiveScale), 8)
  geometry.computeBoundingBox()
  expect(geometry.boundingBox?.max.x).toBeCloseTo(width, 8)
  expect(geometry.boundingBox?.max.y).toBeCloseTo(height, 8)
  geometry.dispose()
})
