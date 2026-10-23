import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { CanvasStroke } from '@core'
import {
  independentSpatialInkResize,
  independentSpatialResizedStroke,
  type SpatialInkCorner,
} from '@renderer/lib/independentSpatialInkResize'
import { inkGeometry } from '@shared/ink-geometry'

const camera = new PerspectiveCamera(42, 1000 / 800, 0.1, 10000)
camera.position.set(500, 350, 1200)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld()
const viewport = { left: 0, top: 0, width: 1000, height: 800 }
const project = (bounds: { x: number; y: number; width: number; height: number }) => {
  const center = new Vector3(bounds.x + bounds.width / 2, -bounds.y - bounds.height / 2, 20)
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const start = center
    .clone()
    .addScaledVector(right, -bounds.width / 2)
    .addScaledVector(up, bounds.height / 2)
    .project(camera)
  const end = center
    .clone()
    .addScaledVector(right, bounds.width / 2)
    .addScaledVector(up, -bounds.height / 2)
    .project(camera)
  return {
    x: (start.x + 1) * 500,
    y: (1 - start.y) * 400,
    width: (end.x - start.x) * 500,
    height: (start.y - end.y) * 400,
  }
}

describe('independent spatial ink resize', () => {
  it.each<SpatialInkCorner>(['top-left', 'top-right', 'bottom-left', 'bottom-right'])(
    'fixes the opposite screen corner at oblique angles for %s',
    (corner) => {
      const original = { x: 20, y: 30, width: 200, height: 80 }
      const rect = project(original)
      const left = corner.endsWith('left'),
        top = corner.startsWith('top')
      const next = independentSpatialInkResize(
        camera,
        viewport,
        rect,
        corner,
        { x: rect.x + (left ? -40 : rect.width + 40), y: rect.y + (top ? -20 : rect.height + 20) },
        20,
      )
      expect(next).not.toBeNull()
      if (!next) throw new Error('Missing resized bounds')
      const after = project(next)
      expect(after.width).toBeCloseTo(rect.width + 40, 6)
      expect(after.height).toBeCloseTo(rect.height + 20, 6)
      expect(after.x + (left ? after.width : 0)).toBeCloseTo(rect.x + (left ? rect.width : 0), 6)
      expect(after.y + (top ? after.height : 0)).toBeCloseTo(rect.y + (top ? rect.height : 0), 6)
    },
  )

  it('preserves original pressure samples and rejects invalid transforms', () => {
    const stroke: CanvasStroke = {
      id: 'ink',
      color: '#123456',
      width: 8,
      spatialDepth: 20,
      points: [
        { x: 10, y: 10, pressure: 0.2 },
        { x: 80, y: 30, pressure: 0.8 },
      ],
    }
    const bounds = inkGeometry(stroke).bounds
    const resized = independentSpatialResizedStroke(stroke, bounds, {
      ...bounds,
      width: bounds.width * 2,
      height: bounds.height * 3,
    })
    expect(resized?.points).toBe(stroke.points)
    expect(resized?.spatialDepth).toBe(20)
    expect(resized?.transform?.scaleX).toBeCloseTo(2, 12)
    expect(resized?.transform?.scaleY).toBeCloseTo(3, 12)
    expect(
      independentSpatialResizedStroke(stroke, bounds, { ...bounds, width: Number.NaN }),
    ).toBeNull()
    expect(
      independentSpatialResizedStroke(stroke, bounds, { ...bounds, height: bounds.height * 1001 }),
    ).toBeNull()
  })
})
