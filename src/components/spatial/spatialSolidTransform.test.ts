import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { makeSpatialSolidGeometry } from '@renderer/components/spatial/spatialSolidGeometry'
import { spatialSolidMatrix } from '@renderer/components/spatial/spatialSolidTransform'
import { projectSpatialPoint, spatialCameraQuaternion } from '@renderer/lib/spatialCamera'
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
