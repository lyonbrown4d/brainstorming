import { afterEach, expect, it, vi } from 'vitest'
import type { CameraControlsImpl } from '@react-three/drei'
import { bindIndependentSpatialCameraInput } from '@renderer/lib/independentSpatialCameraInput'
import { independentSpatialCameraNeedsFocus } from '@renderer/lib/independentSpatialCameraFocus'

const pointer = (kind: string, values: Record<string, number | boolean> = {}): Event => {
  const event = new Event(kind, { cancelable: true })
  Object.assign(
    event,
    { pointerId: 1, button: 0, clientX: 100, clientY: 100, shiftKey: false },
    values,
  )
  return event
}
const harness = () => {
  const canvas = new EventTarget() as HTMLCanvasElement
  Object.assign(canvas, { getBoundingClientRect: () => ({ left: 0, top: 0 }) })
  const nativeWindow = new EventTarget()
  vi.stubGlobal('window', nativeWindow)
  const controls = { enabled: false } as CameraControlsImpl
  const start = vi.fn()
  const end = vi.fn()
  const cancel = vi.fn(() => true)
  const wheel = vi.fn()
  const truck = vi.fn()
  const pick = vi.fn<() => unknown>(() => null)
  const canNavigate = vi.fn(() => true)
  const stop = bindIndependentSpatialCameraInput({
    canvas,
    controls,
    start,
    end,
    cancel,
    wheel,
    truck,
    pick,
    canNavigate,
    size: () => ({ width: 1200, height: 800 }),
  })
  return {
    canvas,
    nativeWindow,
    controls,
    start,
    end,
    cancel,
    wheel,
    truck,
    pick,
    canNavigate,
    stop,
  }
}
afterEach(() => vi.unstubAllGlobals())

it('reserves node hits, Shift selection and blocked editing for the scene editor', () => {
  const h = harness()
  h.pick.mockReturnValue({ id: 'topic' })
  h.canvas.dispatchEvent(pointer('pointerdown'))
  expect(h.controls.enabled).toBe(false)
  expect(h.start).not.toHaveBeenCalled()
  h.pick.mockReturnValue(null)
  h.canvas.dispatchEvent(pointer('pointerdown', { shiftKey: true }))
  h.canNavigate.mockReturnValue(false)
  h.canvas.dispatchEvent(pointer('pointerdown'))
  expect(h.start).not.toHaveBeenCalled()
  h.canNavigate.mockReturnValue(true)
  h.canvas.dispatchEvent(pointer('pointerdown'))
  expect(h.controls.enabled).toBe(true)
  expect(h.start).toHaveBeenCalledOnce()
  h.stop()
})

it('tracks multi-touch until the final pointer and removes every native handler', () => {
  const h = harness()
  h.canvas.dispatchEvent(pointer('pointerdown'))
  h.canvas.dispatchEvent(pointer('pointerdown', { pointerId: 2 }))
  h.nativeWindow.dispatchEvent(pointer('pointerup'))
  expect(h.end).not.toHaveBeenCalled()
  h.nativeWindow.dispatchEvent(pointer('pointerup', { pointerId: 2 }))
  expect(h.end).toHaveBeenCalledOnce()
  h.canvas.dispatchEvent(pointer('pointerdown'))
  h.nativeWindow.dispatchEvent(pointer('pointercancel'))
  expect(h.cancel).toHaveBeenCalledOnce()
  h.stop()
  h.canvas.dispatchEvent(pointer('pointerdown'))
  h.nativeWindow.dispatchEvent(new Event('blur'))
  expect(h.start).toHaveBeenCalledTimes(2)
  expect(h.cancel).toHaveBeenCalledOnce()
})

it('trucks with the right button, suppresses dragged clicks and accepts pinch over topics', () => {
  const h = harness()
  h.canvas.dispatchEvent(pointer('pointerdown', { button: 2 }))
  h.nativeWindow.dispatchEvent(pointer('pointermove', { clientX: 120, clientY: 115 }))
  expect(h.truck).toHaveBeenCalledWith(20, 15)
  const menu = new Event('contextmenu', { cancelable: true })
  h.canvas.dispatchEvent(menu)
  expect(menu.defaultPrevented).toBe(true)
  h.pick.mockReturnValue({ id: 'topic' })
  const wheel = new Event('wheel', { cancelable: true })
  Object.assign(wheel, {
    clientX: 600,
    clientY: 400,
    deltaX: 0,
    deltaY: -25,
    deltaMode: 0,
    ctrlKey: true,
  })
  h.canvas.dispatchEvent(wheel)
  expect(h.wheel).toHaveBeenCalledWith({ kind: 'dolly', x: 0, y: 0, deltaY: -25 })
  expect(wheel.defaultPrevented).toBe(true)
  h.stop()
})

it('moves keyboard focus only for missing or clipped topics', () => {
  const rect = {
    id: 'topic',
    kind: 'topic' as const,
    x: 100,
    y: 100,
    width: 100,
    height: 60,
    depth: 200,
  }
  const bounds = { left: 0, top: 0, right: 1200, bottom: 800 }
  expect(independentSpatialCameraNeedsFocus(rect, bounds)).toBe(false)
  expect(independentSpatialCameraNeedsFocus({ ...rect, x: 10 }, bounds)).toBe(true)
  expect(independentSpatialCameraNeedsFocus({ ...rect, y: 760 }, bounds)).toBe(true)
  expect(independentSpatialCameraNeedsFocus(undefined, bounds)).toBe(true)
})
