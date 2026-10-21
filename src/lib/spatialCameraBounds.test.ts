import { afterEach, expect, it, vi } from 'vitest'
import { observeSpatialCameraBounds } from '@renderer/lib/spatialCameraController'

const resize = { current: (): void => undefined }
const disconnect = vi.fn()
const observe = vi.fn()
const installObserver = () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize.current = callback
      }
      observe = observe
      disconnect = disconnect
    },
  )
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('keeps camera input free of synchronous layout reads until the pane actually resizes', () => {
  installObserver()
  let width = 1200
  let height = 800
  const readWidth = vi.fn(() => width)
  const readHeight = vi.fn(() => height)
  const root = Object.defineProperties(
    {},
    {
      clientWidth: { get: readWidth },
      clientHeight: { get: readHeight },
    },
  ) as HTMLElement
  const bounds = observeSpatialCameraBounds(root)
  if (!bounds) throw new Error('Expected visible pane bounds')
  expect(bounds.initial).toEqual({ width: 1200, height: 800 })
  for (let frame = 0; frame < 120; frame++) expect(bounds.read()).toBe(bounds.initial)
  expect(readWidth).toHaveBeenCalledTimes(1)
  expect(readHeight).toHaveBeenCalledTimes(1)
  width = 900
  height = 600
  resize.current()
  expect(bounds.read()).toEqual({ width: 900, height: 600 })
  width = 0
  height = 0
  resize.current()
  expect(bounds.read()).toEqual({ width: 900, height: 600 })
  expect(observe).toHaveBeenCalledWith(root)
  bounds.dispose()
  expect(disconnect).toHaveBeenCalledOnce()
})

it('does not initialize a camera with an empty pane', () => {
  installObserver()
  const root = { clientWidth: 0, clientHeight: 0 } as HTMLElement
  expect(observeSpatialCameraBounds(root)).toBeNull()
  expect(observe).not.toHaveBeenCalled()
})
