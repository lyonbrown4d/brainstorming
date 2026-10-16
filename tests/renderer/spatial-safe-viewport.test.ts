import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import {
  spatialFramingTarget,
  spatialSafeViewport,
} from '../../src/renderer/src/lib/spatialSafeViewport'
import { spatialSelectionShift } from '../../src/renderer/src/lib/spatialSelectionVisibility'

const viewport = { left: 24, top: 60, width: 1440, height: 800 }

describe('spatial canvas safe area', () => {
  it('deducts the exact open panel widths from a full canvas', () => {
    expect(spatialSafeViewport(viewport, false, false)).toEqual(viewport)
    expect(spatialSafeViewport(viewport, true, false)).toMatchObject({ left: 240, width: 1224 })
    expect(spatialSafeViewport(viewport, false, true)).toMatchObject({ left: 24, width: 1184 })
    const safe = spatialSafeViewport(viewport, true, true)
    expect(safe).toEqual({ ...viewport, left: 240, width: 968 })
    expect(safe.left + safe.width / 2).toBe(viewport.left + viewport.width / 2 - 20)
  })

  it.each([false, true])('fits the center into the visible area with reset=%s', (reset) => {
    const camera = new PerspectiveCamera(42, viewport.width / viewport.height, 0.1, 500)
    camera.position.set(7, 4, 15)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const center = new Vector3(2, 1, -3)
    const canonical = new Vector3(0.15, 0.23, 1).normalize()
    const direction = reset ? canonical : camera.getWorldDirection(new Vector3()).negate()
    const safe = spatialSafeViewport(viewport, true, true)
    const target = spatialFramingTarget(
      camera,
      center,
      18,
      viewport,
      safe,
      reset ? canonical : undefined,
    )
    camera.position.copy(target).addScaledVector(direction, 18)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    const projected = center.clone().project(camera)
    expect(viewport.left + ((projected.x + 1) * viewport.width) / 2).toBeCloseTo(
      safe.left + safe.width / 2,
      8,
    )
    expect(viewport.top + ((1 - projected.y) * viewport.height) / 2).toBeCloseTo(
      safe.top + safe.height / 2,
      8,
    )
    expect(camera.position.distanceTo(target)).toBeCloseTo(18, 10)
    expect(camera.fov).toBe(42)
  })

  it.each([-6, 6])('reveals a card covered by a panel at x=%s through translation', (x) => {
    const camera = new PerspectiveCamera(42, viewport.width / viewport.height, 0.1, 500)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const node = { position: [x, 0, 0] as const, width: 2, height: 0.7 }
    const safe = spatialSafeViewport(viewport, true, true)
    const shift = spatialSelectionShift(camera, node, viewport, safe)
    if (!shift) throw new Error('Missing covered-card translation')
    camera.position.add(shift)
    camera.lookAt(shift)
    camera.updateMatrixWorld()
    const projected = new Vector3(...node.position).project(camera)
    const screenX = viewport.left + ((projected.x + 1) * viewport.width) / 2
    expect(screenX).toBeGreaterThan(safe.left + 28)
    expect(screenX).toBeLessThan(safe.left + safe.width - 28)
    expect(camera.position.distanceTo(shift)).toBeCloseTo(10, 10)
  })

  it('keeps a positive usable area in a very narrow surface', () => {
    const small = { ...viewport, width: 320 }
    const safe = spatialSafeViewport(small, true, true)
    expect(safe.width).toBe(80)
    expect(safe.left).toBeGreaterThanOrEqual(small.left)
    expect(safe.left + safe.width).toBeLessThanOrEqual(small.left + small.width)
  })
})
