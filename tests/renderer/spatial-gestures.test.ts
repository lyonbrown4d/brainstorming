import { describe, expect, it } from 'vitest'
import { spatialWheelGesture } from '../../src/renderer/src/lib/spatialGestures'

const wheel = {
  deltaX: 12,
  deltaY: 24,
  deltaMode: 0,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
}
const viewport = { width: 90, height: 180 }

describe('3D wheel gesture boundary', () => {
  it('maps ordinary wheel to two-axis pan and normalizes pixel, line and page deltas', () => {
    expect(spatialWheelGesture(wheel, viewport)).toEqual({ kind: 'pan', x: 12, y: 24 })
    expect(
      spatialWheelGesture({ ...wheel, deltaX: 0.75, deltaY: 1.5, deltaMode: 1 }, viewport),
    ).toEqual({ kind: 'pan', x: 12, y: 24 })
    expect(
      spatialWheelGesture({ ...wheel, deltaX: 1, deltaY: -1, deltaMode: 2 }, viewport),
    ).toEqual({ kind: 'pan', x: 90, y: -180 })
  })

  it('reserves pinch for dolly and Alt for rotation, including simultaneous modifiers', () => {
    expect(spatialWheelGesture({ ...wheel, ctrlKey: true }, viewport)?.kind).toBe('dolly')
    expect(spatialWheelGesture({ ...wheel, altKey: true }, viewport)?.kind).toBe('rotate')
    expect(
      spatialWheelGesture({ ...wheel, ctrlKey: true, altKey: true, shiftKey: true }, viewport),
    ).toEqual({ kind: 'dolly', x: 12, y: 24 })
    expect(
      spatialWheelGesture({ ...wheel, deltaX: 0, ctrlKey: true, shiftKey: true }, viewport),
    ).toEqual({ kind: 'dolly', x: 0, y: 24 })
  })

  it('uses Shift for horizontal movement without swapping browser-mapped deltas twice', () => {
    expect(spatialWheelGesture({ ...wheel, deltaX: 0, shiftKey: true }, viewport)).toEqual({
      kind: 'pan',
      x: 24,
      y: 0,
    })
    expect(spatialWheelGesture({ ...wheel, deltaY: 0, shiftKey: true }, viewport)).toEqual({
      kind: 'pan',
      x: 12,
      y: 0,
    })
  })

  it('bounds extreme deltas and rejects invalid, zero and unmeasured inputs', () => {
    expect(
      spatialWheelGesture({ ...wheel, deltaX: -1e308, deltaY: 1e308, deltaMode: 1 }, viewport),
    ).toEqual({ kind: 'pan', x: -240, y: 240 })
    for (const event of [
      { ...wheel, deltaX: NaN },
      { ...wheel, deltaY: Infinity },
      { ...wheel, deltaMode: 3 },
      { ...wheel, deltaX: 0, deltaY: 0 },
    ])
      expect(spatialWheelGesture(event, viewport)).toBeNull()
    expect(spatialWheelGesture(wheel, { width: 0, height: 180 })).toBeNull()
    expect(spatialWheelGesture(wheel, { width: 90, height: Infinity })).toBeNull()
  })
})
