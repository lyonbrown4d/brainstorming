import { afterEach, expect, it, vi } from 'vitest'
import { CameraControlsImpl } from '@react-three/drei'
import { PerspectiveCamera, Vector3 } from 'three'
import { createExampleDocument } from '@core'
import type * as CameraController from '@renderer/lib/spatialCameraController'
import { createIndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { createIndependentSpatialCameraController } from '@renderer/lib/independentSpatialCameraController'
import { useEditor } from '@renderer/state/editor'
import { DEFAULT_SPATIAL_VIEW, useSpatialView } from '@renderer/state/spatialView'
import { getSpatialViewport } from '@renderer/state/spatialViewports'

vi.mock('@renderer/lib/spatialCameraController', async (original) => ({
  ...(await original<typeof CameraController>()),
  createSpatialControls: (camera: PerspectiveCamera) => new CameraControlsImpl(camera),
}))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('restores its own distance, rolls back cancelled motion and never projects scene nodes per frame', () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'DOMRect',
    class {
      x = 0
      y = 0
      width = 0
      height = 0
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = () => undefined
      disconnect = () => undefined
    },
  )
  const nativeWindow = Object.assign(new EventTarget(), { setTimeout, clearTimeout })
  vi.stubGlobal('window', nativeWindow)
  const previous = useEditor.getState()
  const document = createExampleDocument()
  const spatial = { ...DEFAULT_SPATIAL_VIEW, mode: '3d' as const }
  const nextDocument = { ...document, settings: { ...document.settings, spatial } }
  useEditor.setState({ history: { ...previous.history, document: nextDocument } })
  const canvas = Object.assign(new EventTarget(), {
    clientWidth: 1200,
    clientHeight: 800,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 1200,
      height: 800,
      right: 1200,
      bottom: 800,
    }),
  }) as unknown as HTMLCanvasElement
  const runtime = createIndependentSpatialRuntime({
    document: nextDocument,
    surface: '#fff',
    depths: { [document.rootId]: 0 },
    layout: {
      nodes: [{ id: document.rootId, x: 300, y: 200, width: 180, height: 80, side: 'right' }],
      edges: [],
    },
  })
  const camera = new PerspectiveCamera(42, 1.5, 0.1, 1e7)
  runtime.camera = camera
  runtime.canvas = canvas
  const rectangles = vi.spyOn(runtime, 'rectangles')
  const modes: string[] = []
  const stop = runtime.subscribe((kind) => modes.push(kind))
  const create = () =>
    createIndependentSpatialCameraController({
      runtime,
      camera,
      canvas,
      reducedMotion: true,
      disabled: () => false,
    })
  const first = create()
  if (!first) throw new Error('missing camera controller')
  const original = camera.position.clone()
  const twoDimensional = getSpatialViewport(previous.workbook.id, previous.activeSheetId, '2d')
  const wheel = (): void => {
    const event = new Event('wheel', { cancelable: true })
    Object.assign(event, {
      clientX: 600,
      clientY: 400,
      deltaX: 0,
      deltaY: -80,
      deltaMode: 0,
      ctrlKey: true,
    })
    canvas.dispatchEvent(event)
    for (let frame = 0; frame < 180; frame++) first.update(1 / 60)
  }
  try {
    expect(camera.position.distanceTo(new Vector3(390, -240, 0))).toBeCloseTo(400, 4)
    wheel()
    expect(camera.position.distanceTo(original)).toBeGreaterThan(100)
    expect(runtime.navigating).toBe(true)
    nativeWindow.dispatchEvent(new Event('blur'))
    expect(camera.position.distanceTo(original)).toBeLessThan(0.001)
    expect(runtime.navigating).toBe(false)
    wheel()
    vi.advanceTimersByTime(150)
    first.update(1 / 60)
    const remembered = camera.position.clone()
    first.dispose()
    const second = create()
    if (!second) throw new Error('missing restored controller')
    expect(camera.position.distanceTo(remembered)).toBeLessThan(0.001)
    expect(rectangles).not.toHaveBeenCalled()
    expect(new Set(modes)).toEqual(new Set(['camera']))
    expect(getSpatialViewport(previous.workbook.id, previous.activeSheetId, '2d')).toEqual(
      twoDimensional,
    )
    second.dispose()
  } finally {
    stop()
    useSpatialView.getState().clearView(previous.workbook.id, previous.activeSheetId)
    useEditor.setState(previous, true)
  }
})
