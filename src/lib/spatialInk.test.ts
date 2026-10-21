import { expect, it } from 'vitest'
import type { CanvasStroke } from '@core'
import { projectSpatialPoint } from '@renderer/lib/spatialCamera'
import { placeSpatialInk, projectedInkBounds, resizeSpatialInk } from '@renderer/lib/spatialInk'
import type { SpatialView } from '@renderer/state/spatialView'
import { inkGeometry, type InkBounds } from '@shared/ink-geometry'

const stroke: CanvasStroke = {
  id: 'sketch',
  color: '#334455',
  width: 5,
  points: [
    { x: 20, y: 30, pressure: 0.7 },
    { x: 85, y: 75, pressure: 1 },
    { x: 140, y: 15, pressure: 0.6 },
  ],
}
const views: readonly SpatialView[] = [
  { mode: '3d', yaw: 0, pitch: 0, spacing: 100 },
  { mode: '3d', yaw: Math.PI / 2, pitch: 0, spacing: 100 },
  { mode: '3d', yaw: 0, pitch: Math.PI / 2, spacing: 100 },
  { mode: '3d', yaw: Math.PI, pitch: -0.35, spacing: 100 },
  {
    mode: '3d',
    yaw: -1.1,
    pitch: 0.6,
    spacing: 100,
    target: { x: 210, y: -100, z: 80 },
  },
]

const expectBoundsClose = (actual: InkBounds, expected: InkBounds): void => {
  expect(actual.x).toBeCloseTo(expected.x, 7)
  expect(actual.y).toBeCloseTo(expected.y, 7)
  expect(actual.width).toBeCloseTo(expected.width, 7)
  expect(actual.height).toBeCloseTo(expected.height, 7)
}

it.each(views)('places and resizes ink in the same screen bbox at yaw $yaw', (view) => {
  const screen = inkGeometry(stroke).bounds
  const placed = placeSpatialInk(stroke, view)
  expectBoundsClose(projectedInkBounds(placed, view), screen)
  expect(placed.points).toBe(stroke.points)
  const placedBounds = inkGeometry(placed).bounds
  const placedDepth = projectSpatialPoint(
    {
      x: placedBounds.x + placedBounds.width / 2,
      y: placedBounds.y + placedBounds.height / 2,
      z: placed.spatialDepth ?? 0,
    },
    view,
  ).z
  expect(placedDepth).toBeCloseTo(0, 7)
  const resizedScreen: InkBounds = {
    x: screen.x + 44,
    y: screen.y - 27,
    width: screen.width * 1.4,
    height: screen.height * 0.75,
  }
  const resized = resizeSpatialInk(placed, resizedScreen, view)
  expectBoundsClose(projectedInkBounds(resized, view), resizedScreen)
  expect(resized.points).toBe(stroke.points)
  const resizedBounds = inkGeometry(resized).bounds
  const resizedDepth = projectSpatialPoint(
    {
      x: resizedBounds.x + resizedBounds.width / 2,
      y: resizedBounds.y + resizedBounds.height / 2,
      z: resized.spatialDepth ?? 0,
    },
    view,
  ).z
  expect(resizedDepth).toBeCloseTo(placedDepth, 7)
})

it('keeps the original stroke and bounds in 2D', () => {
  const view: SpatialView = { mode: '2d', yaw: 0.7, pitch: 0.5, spacing: 100 }
  expect(placeSpatialInk(stroke, view)).toBe(stroke)
  expect(projectedInkBounds(stroke, view)).toEqual(inkGeometry(stroke).bounds)
})
