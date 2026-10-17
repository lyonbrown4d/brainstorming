import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { spatialSelectionShift } from '@renderer/lib/spatialSelectionVisibility'

const viewport = { left: 250, top: 60, width: 900, height: 600 }
const fixture = (position: readonly [number, number, number]) => {
  const camera = new PerspectiveCamera(42, viewport.width / viewport.height, 0.1, 500)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return { camera, node: { position, width: 2, height: 0.7 } }
}

describe('new spatial selection visibility', () => {
  it('leaves an already visible card and camera untouched', () => {
    const { camera, node } = fixture([0, 0, 0])
    expect(spatialSelectionShift(camera, node, viewport)).toBeNull()
    expect(camera.position.toArray()).toEqual([0, 0, 10])
    expect(camera.fov).toBe(42)
  })

  it.each([
    [10, 0, 0],
    [-10, 0, 0],
    [0, 8, 0],
    [0, -8, 0],
  ] as const)(
    'reveals an offscreen card at (%s, %s, %s) without changing camera distance',
    (x, y, z) => {
      const { camera, node } = fixture([x, y, z])
      const shift = spatialSelectionShift(camera, node, viewport)
      if (!shift) throw new Error('Missing selection translation')
      const target = new Vector3().add(shift)
      camera.position.add(shift)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      const point = new Vector3(...node.position).project(camera)
      expect(Math.abs(point.x)).toBeLessThan(1)
      expect(Math.abs(point.y)).toBeLessThan(1)
      expect(camera.position.distanceTo(target)).toBeCloseTo(10, 10)
      expect(camera.fov).toBe(42)
    },
  )

  it('centers an oversized card while preserving the chosen zoom', () => {
    const { camera, node } = fixture([8, 0, 0])
    const shift = spatialSelectionShift(camera, { ...node, width: 20 }, viewport)
    if (!shift) throw new Error('Missing oversized-card translation')
    camera.position.add(shift)
    camera.lookAt(shift)
    camera.updateMatrixWorld()
    expect(Math.abs(new Vector3(...node.position).project(camera).x)).toBeLessThan(0.1)
    expect(camera.position.distanceTo(shift)).toBeCloseTo(10, 10)
  })

  it('skips behind-camera selections and a collapsed surface', () => {
    const { camera, node } = fixture([0, 0, 20])
    expect(spatialSelectionShift(camera, node, viewport)).toBeNull()
    expect(
      spatialSelectionShift(
        camera,
        { ...node, position: [0, 0, 0] },
        {
          ...viewport,
          width: 0,
        },
      ),
    ).toBeNull()
  })
})
