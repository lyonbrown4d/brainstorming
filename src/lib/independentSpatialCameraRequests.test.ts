import { expect, it, vi } from 'vitest'
import { createExampleDocument } from '@core'
import { createIndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { bindIndependentSpatialCameraRequests } from '@renderer/lib/independentSpatialCameraRequests'
import { useEditor } from '@renderer/state/editor'
import { useSpatialCameraRequest } from '@renderer/state/spatialCameraCommands'
import { DEFAULT_SPATIAL_VIEW } from '@renderer/state/spatialView'
import { requestViewport, useViewportRequest, useTopicFocusRequest } from '@renderer/state/viewport'

it('routes shared viewport actions and defers newly selected topic focus until native layout arrives', () => {
  vi.stubGlobal('window', new EventTarget())
  const previous = useEditor.getState()
  const requests = useSpatialCameraRequest.getState()
  const viewport = useViewportRequest.getState()
  const topicFocus = useTopicFocusRequest.getState()
  const document = createExampleDocument()
  const spatial = { ...DEFAULT_SPATIAL_VIEW, mode: '3d' as const }
  const current = { ...document, settings: { ...document.settings, spatial } }
  useEditor.setState({
    history: { ...previous.history, document: current },
    selectedId: current.rootId,
  })
  const root = { id: current.rootId, x: 0, y: 0, width: 180, height: 80, side: 'right' as const }
  const runtime = createIndependentSpatialRuntime({
    document: current,
    surface: '#fff',
    depths: {},
    layout: { nodes: [root], edges: [] },
  })
  const stop = bindIndependentSpatialCameraRequests(
    runtime,
    previous.workbook.id,
    previous.activeSheetId,
  )
  try {
    const initialSequence = useSpatialCameraRequest.getState().sequence
    expect(initialSequence).toBe(requests.sequence)
    requestViewport('zoomIn')
    expect(useSpatialCameraRequest.getState().request?.command).toBe('zoomIn')
    const zoomSequence = useSpatialCameraRequest.getState().sequence
    useEditor.setState({ selectedId: 'new-child', editingId: 'new-child' })
    expect(useSpatialCameraRequest.getState().sequence).toBe(zoomSequence)
    runtime.model = {
      ...runtime.model,
      layout: { nodes: [root, { ...root, id: 'new-child', x: 1400 }], edges: [] },
    }
    runtime.changed('model')
    expect(useSpatialCameraRequest.getState().request?.command).toEqual({
      kind: 'focusTopic',
      topicId: 'new-child',
    })
    const focusedSequence = useSpatialCameraRequest.getState().sequence
    runtime.changed('camera')
    expect(useSpatialCameraRequest.getState().sequence).toBe(focusedSequence)
  } finally {
    stop()
    vi.unstubAllGlobals()
    useEditor.setState(previous, true)
    useSpatialCameraRequest.setState(requests, true)
    useViewportRequest.setState(viewport, true)
    useTopicFocusRequest.setState(topicFocus, true)
  }
})
