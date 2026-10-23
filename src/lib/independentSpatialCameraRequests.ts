import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { useEditor } from '@renderer/state/editor'
import { requestSpatialCamera } from '@renderer/state/spatialCameraCommands'
import { getSpatialView } from '@renderer/state/spatialView'
import { clearTopicFocus, useTopicFocusRequest, useViewportRequest } from '@renderer/state/viewport'

/** Bridge shared keyboard and toolbar intent to the perspective camera's own command queue. */
export const bindIndependentSpatialCameraRequests = (
  runtime: IndependentSpatialRuntime,
  workbookId: string,
  sheetId: string,
): (() => void) => {
  let selectedId = useEditor.getState().selectedId
  let pending: string | null = null
  let pointerSelecting = false
  const pointerDown = (event: PointerEvent): void => {
    if (event.target !== runtime.canvas) return
    pointerSelecting = true
    queueMicrotask(() => {
      pointerSelecting = false
    })
  }
  window.addEventListener('pointerdown', pointerDown, true)
  const active = (): boolean => {
    const editor = useEditor.getState()
    return (
      editor.workbook.id === workbookId &&
      editor.activeSheetId === sheetId &&
      getSpatialView(workbookId, sheetId).mode === '3d'
    )
  }
  const flush = (): void => {
    if (!active()) {
      pending = null
      return
    }
    const request = useTopicFocusRequest.getState().request
    if (
      request?.workbookId === workbookId &&
      request.sheetId === sheetId &&
      request.document === useEditor.getState().history.document
    )
      pending = request.topicId
    if (!pending || !runtime.model.layout.nodes.some((node) => node.id === pending)) return
    const topicId = pending
    requestSpatialCamera({ kind: 'focusTopic', topicId })
    pending = null
    if (request?.topicId === topicId) clearTopicFocus(request.sequence)
  }
  const stops = [
    useViewportRequest.subscribe(({ action }) => {
      if (action && active()) requestSpatialCamera(action)
    }),
    useTopicFocusRequest.subscribe(flush),
    useEditor.subscribe((state) => {
      if (selectedId === state.selectedId) return
      selectedId = state.selectedId
      if (pointerSelecting) {
        pending = null
        return
      }
      pending = selectedId
      flush()
    }),
    runtime.subscribe((kind) => {
      if (kind === 'model') flush()
    }),
  ]
  flush()
  return () => {
    window.removeEventListener('pointerdown', pointerDown, { capture: true })
    for (const stop of stops) stop()
  }
}
