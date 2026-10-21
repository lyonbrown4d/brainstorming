import { afterEach, expect, it, vi } from 'vitest'
import { CameraControlsImpl } from '@react-three/drei'
import { PerspectiveCamera } from 'three'
import type * as CameraController from '@renderer/lib/spatialCameraController'
import { bindSpatialCameraEnvironment } from '@renderer/state/spatialCameraEnvironment'
import { useEditor } from '@renderer/state/editor'
import { DEFAULT_SPATIAL_VIEW, getSpatialView, useSpatialView } from '@renderer/state/spatialView'

vi.mock('@renderer/lib/spatialCameraController', async (original) => ({
  ...(await original<typeof CameraController>()),
  observeSpatialCameraSize: () => () => undefined,
}))
afterEach(() => {
  vi.unstubAllGlobals()
})

it('keeps the transient camera across native JSON responses and resets it only for changed settings', () => {
  vi.stubGlobal(
    'DOMRect',
    class {
      x = 0
      y = 0
      width = 0
      height = 0
    },
  )
  const previous = useEditor.getState()
  const workbookId = previous.workbook.id
  const sheetId = previous.activeSheetId
  const spatial = { ...DEFAULT_SPATIAL_VIEW, mode: '3d' as const }
  const document = {
    ...previous.history.document,
    settings: { ...previous.history.document.settings, spatial },
  }
  useEditor.setState({ history: { ...previous.history, document } })
  const camera = new PerspectiveCamera(42, 1.5)
  const controls = new CameraControlsImpl(camera)
  const changed = vi.fn()
  const stop = bindSpatialCameraEnvironment({
    root: {} as HTMLElement,
    camera,
    controls,
    workbookId,
    sheetId,
    scene: () => ({ selectedId: document.rootId, rootId: document.rootId }),
    size: () => ({ width: 1200, height: 800 }),
    distance: () => 1000,
    defaultTarget: { x: 0, y: 0, z: 0 },
    finishSession: vi.fn(),
    transition: false,
    onCommand: vi.fn(),
    onView: vi.fn(),
    onViewport: vi.fn(),
    subscribeViewport: () => () => undefined,
    initialSettings: spatial,
    onSettingsChanged: changed,
    session: () => null,
    cancelSession: vi.fn(),
    applyDistance: vi.fn(),
    publish: vi.fn(),
  })
  try {
    const target = { x: 120, y: 80, z: 50 }
    useSpatialView.getState().setView(workbookId, sheetId, { target })
    const response = structuredClone(document)
    useEditor.setState({ history: { ...previous.history, document: response } })
    expect(changed).not.toHaveBeenCalled()
    expect(getSpatialView(workbookId, sheetId).target).toEqual(target)
    const updated = {
      ...response,
      settings: { ...response.settings, spatial: { ...spatial, yaw: -0.8 } },
    }
    useEditor.setState({ history: { ...previous.history, document: updated } })
    expect(changed).toHaveBeenCalledOnce()
    expect(getSpatialView(workbookId, sheetId).yaw).toBe(-0.8)
    expect(getSpatialView(workbookId, sheetId).target).toEqual({ x: 0, y: 0, z: 0 })
  } finally {
    stop()
    controls.dispose()
    useSpatialView.getState().clearView(workbookId, sheetId)
    useEditor.setState(previous, true)
  }
})
