import { useEffect, useState } from 'react'
import { isEqual } from 'lodash-es'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import {
  independentSpatialPointerPlane,
  independentSpatialMarquee,
  independentSpatialMarqueeSelection,
  type SpatialMarquee,
} from '@renderer/lib/independentSpatialGestureGeometry'
import {
  independentSpatialAnchor,
  independentSpatialStartDrag,
  independentSpatialClickSelection,
  type IndependentSpatialPointerSession,
} from '@renderer/lib/independentSpatialGestureSession'
import {
  independentSpatialDoubleClick,
  bindIndependentSpatialBlankActions,
} from '@renderer/lib/independentSpatialGestureActions'
import { useEditor } from '@renderer/state/editor'
import {
  selectedTopicIds,
  selectedDrawingIds,
  setCanvasSelection,
  selectTopic,
  selectDrawing,
} from '@renderer/state/selection'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { getSpatialView, useSpatialView } from '@renderer/state/spatialView'
import { usePresentation } from '@renderer/state/presentation'
import {
  interactAnnotationTopic,
  useAnnotationInteraction,
} from '@renderer/state/annotationInteraction'
import {
  beginCanvasDrag,
  updateCanvasDrag,
  clearCanvasDrag,
  useCanvasInteraction,
} from '@renderer/state/canvasInteraction'

export interface IndependentSpatialGestureOverlay {
  readonly marquee: SpatialMarquee | null
  readonly dropLine: {
    readonly from: { x: number; y: number }
    readonly to: { x: number; y: number }
  } | null
}
const emptyOverlay: IndependentSpatialGestureOverlay = { marquee: null, dropLine: null }

/** Three owns pointer input; only selection and typed document commands cross canvas boundaries. */
export const useIndependentSpatialGestures = (
  runtime: IndependentSpatialRuntime,
  ready: boolean,
) => {
  const [overlay, setOverlay] = useState<IndependentSpatialGestureOverlay>(emptyOverlay)
  useEffect(() => {
    const canvas = runtime.canvas
    if (!ready || !canvas) return
    let session: IndependentSpatialPointerSession | null = null
    const clear = (revert: boolean) => {
      const active = session
      if (!active) return
      session = null
      runtime.interacting = false
      if (active.token) clearCanvasDrag(active.token)
      if (revert) active.move?.cancel()
      const dropChanged = runtime.dropTarget !== null
      runtime.dropTarget = null
      if (useEditor.getState().dropTargetId !== null) useEditor.setState({ dropTargetId: null })
      setOverlay(emptyOverlay)
      if (canvas.hasPointerCapture(active.pointer)) canvas.releasePointerCapture(active.pointer)
      if (dropChanged) runtime.changed()
    }
    const valid = (active: IndependentSpatialPointerSession) => {
      const editor = useEditor.getState()
      return (
        editor.workbook.id === active.workbook &&
        editor.activeSheetId === active.sheet &&
        editor.history.document === active.document &&
        getSpatialView(active.workbook, active.sheet) === active.view &&
        !editor.busy &&
        !usePresentation.getState().playing
      )
    }
    const validate = () => {
      if (session && !valid(session)) clear(true)
    }
    const down = (event: PointerEvent) => {
      if (session || event.button !== 0 || useCanvasInk.getState().mode !== 'select') return
      const editor = useEditor.getState()
      if (
        editor.busy ||
        usePresentation.getState().playing ||
        runtime.model.document !== editor.history.document
      )
        return
      const hit = runtime.pick(event.clientX, event.clientY)
      if (!hit && !event.shiftKey) return
      event.preventDefault()
      event.stopImmediatePropagation()
      runtime.freezeCamera()
      editor.commitDraft()
      if (
        useEditor.getState().editingId ||
        useEditor.getState().history.document !== runtime.model.document
      )
        return
      document.getElementById('sheet-panel')?.focus({ preventScroll: true })
      if (hit?.kind === 'topic' && interactAnnotationTopic(hit.id)) return
      if (hit) useAnnotationInteraction.setState({ selected: null, editing: false })
      const additive = event.metaKey || event.ctrlKey || event.shiftKey
      const topics = selectedTopicIds(useEditor.getState())
      const drawings = selectedDrawingIds(useEditor.getState())
      if (hit) {
        const selected =
          hit.kind === 'topic' ? topics.includes(hit.id) : drawings.includes(hit.drawingId)
        if (additive || !selected) {
          if (hit.kind === 'topic') selectTopic(hit.id, additive)
          else selectDrawing(hit.drawingId, additive)
          if (additive && selected) return
        }
      }
      const current = useEditor.getState()
      const selectedTopics = selectedTopicIds(current)
      const selectedDrawings = selectedDrawingIds(current)
      const center = hit ? independentSpatialAnchor(runtime, hit.id) : null
      const plane =
        runtime.camera && center
          ? independentSpatialPointerPlane(runtime.camera, canvas.getBoundingClientRect(), center)
          : null
      const start = { x: event.clientX, y: event.clientY }
      session = {
        pointer: event.pointerId,
        start,
        document: current.history.document,
        workbook: current.workbook.id,
        sheet: current.activeSheetId,
        view: getSpatialView(current.workbook.id, current.activeSheetId),
        rectangles: [],
        topics: additive ? topics : [],
        drawings: additive ? drawings : [],
        movingTopics: selectedTopics,
        movingDrawings: selectedDrawings,
        move: null,
        plane,
        anchor: plane?.(start) ?? null,
        rect: hit,
        find: null,
        token: null,
        dragged: false,
        singlePick: !additive,
      }
      runtime.interacting = true
      canvas.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => {
      const active = session
      if (active?.pointer !== event.pointerId) return
      event.preventDefault()
      if (!valid(active)) {
        clear(true)
        return
      }
      const point = { x: event.clientX, y: event.clientY }
      const dx = point.x - active.start.x,
        dy = point.y - active.start.y
      if (!active.dragged && Math.hypot(dx, dy) < 4) return
      independentSpatialStartDrag(runtime, active)
      if (!active.move) {
        const marquee = independentSpatialMarquee(active.start, point)
        const hits = independentSpatialMarqueeSelection(active.rectangles, marquee)
        setCanvasSelection(
          [...active.topics, ...hits.topics],
          [...active.drawings, ...hits.drawings],
        )
        setOverlay({ marquee, dropLine: null })
        return
      }
      const next = active.plane?.(point)
      if (!next || !active.anchor || !active.rect) return
      active.token ??= beginCanvasDrag(
        active.document,
        active.sheet,
        active.move.roots,
        selectedDrawingIds(useEditor.getState()).length,
      )
      const bounds = {
        x: active.rect.x + dx,
        y: active.rect.y + dy,
        width: active.rect.width,
        height: active.rect.height,
      }
      const drop = active.find?.(point, bounds)
      updateCanvasDrag(active.token, drop)
      runtime.dropTarget = drop?.targetId ?? null
      useEditor.setState({ dropTargetId: runtime.dropTarget })
      const target = active.rectangles.find((rect) => rect.id === drop?.targetId)
      setOverlay({
        marquee: null,
        dropLine: target
          ? {
              from: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
              to: { x: target.x + target.width / 2, y: target.y + target.height / 2 },
            }
          : null,
      })
      active.move.preview({
        x: next.x - active.anchor.x,
        y: next.y - active.anchor.y,
        z: next.z - active.anchor.z,
      })
    }
    const up = (event: PointerEvent) => {
      const active = session
      if (active?.pointer !== event.pointerId) return
      move(event)
      if (session !== active) return
      const drop = active.token ? readCanvasInteractionDrop(active.token) : undefined
      const command = valid(active) && active.dragged ? active.move?.finish(drop) : undefined
      const selection = valid(active) ? independentSpatialClickSelection(active) : null
      clear(!command)
      if (
        selection &&
        (!isEqual(selection.topics, selectedTopicIds(useEditor.getState())) ||
          !isEqual(selection.drawings, selectedDrawingIds(useEditor.getState())))
      )
        setCanvasSelection(selection.topics, selection.drawings)
      if (
        command &&
        !useEditor.getState().command(command, () => {
          active.move?.cancel()
        })
      )
        active.move?.cancel()
    }
    const doubleClick = independentSpatialDoubleClick(runtime)
    const stopBlank = bindIndependentSpatialBlankActions(runtime)
    const cancel = () => {
      clear(true)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && session) {
        event.preventDefault()
        event.stopImmediatePropagation()
        cancel()
      }
    }
    const unsubscribe = useEditor.subscribe(validate)
    const stopView = useSpatialView.subscribe(validate)
    const stopPresentation = usePresentation.subscribe(validate)
    const stopRuntime = runtime.subscribe((kind) => {
      if (kind === 'model') {
        cancel()
        runtime.offsets.clear()
        runtime.changed()
      }
    })
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel)
    canvas.addEventListener('dblclick', doubleClick)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', cancel)
    return () => {
      cancel()
      unsubscribe()
      stopView()
      stopPresentation()
      stopRuntime()
      stopBlank()
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('lostpointercapture', cancel)
      canvas.removeEventListener('dblclick', doubleClick)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', cancel)
    }
  }, [runtime, ready])
  return overlay
}

const readCanvasInteractionDrop = (token: symbol) => {
  const drag = useCanvasInteraction.getState().drag
  return drag?.token === token ? (drag.drop ?? undefined) : undefined
}
