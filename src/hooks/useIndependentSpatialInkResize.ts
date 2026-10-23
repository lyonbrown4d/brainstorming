import { independentSpatialInkIdentity } from '@renderer/lib/independentSpatialInkIdentity'
import { useEffect, useRef, type PointerEvent } from 'react'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import {
  independentSpatialInkResize,
  independentSpatialResizedStroke,
  type SpatialInkCorner,
} from '@renderer/lib/independentSpatialInkResize'
import { inkGeometry } from '@shared/ink-geometry'
import { useEditor } from '@renderer/state/editor'
import { selectedDrawingIds, selectedTopicIds, useSelection } from '@renderer/state/selection'
import { getSpatialView, useSpatialView } from '@renderer/state/spatialView'
import { usePresentation } from '@renderer/state/presentation'
import { useCanvasInk } from '@renderer/state/canvasInk'

export const useIndependentSpatialInkResize = (runtime: IndependentSpatialRuntime) => {
  const cancel = useRef<(() => void) | null>(null)
  useEffect(() => () => cancel.current?.(), [runtime])
  return (event: PointerEvent, id: string, corner: SpatialInkCorner) => {
    if (event.button !== 0 || !runtime.camera || !runtime.canvas) return
    const editor = useEditor.getState()
    const stroke = editor.history.document.drawings?.find((item) => item.id === id)
    const key = independentSpatialInkIdentity(runtime.model.document).byDrawing.get(id)
    const rect = key ? runtime.rectangle(key) : null
    if (
      !key ||
      !stroke ||
      !rect ||
      editor.busy ||
      editor.editingId ||
      runtime.model.document !== editor.history.document ||
      selectedTopicIds(editor).length ||
      selectedDrawingIds(editor).length !== 1 ||
      usePresentation.getState().playing ||
      useCanvasInk.getState().mode !== 'select'
    )
      return
    event.preventDefault()
    event.stopPropagation()
    cancel.current?.()
    runtime.freezeCamera()
    const camera = runtime.camera,
      viewport = runtime.canvas.getBoundingClientRect()
    const original = inkGeometry(stroke).bounds
    const workbook = editor.workbook.id,
      sheet = editor.activeSheetId,
      document = editor.history.document
    const view = getSpatialView(workbook, sheet)
    const target = event.currentTarget,
      pointer = event.pointerId
    const grab = {
      x: event.clientX - rect.x - (corner.endsWith('right') ? rect.width : 0),
      y: event.clientY - rect.y - (corner.startsWith('bottom') ? rect.height : 0),
    }
    let bounds = original
    const valid = () => {
      const current = useEditor.getState()
      return (
        current.workbook.id === workbook &&
        current.activeSheetId === sheet &&
        current.history.document === document &&
        !current.busy &&
        !current.editingId &&
        !usePresentation.getState().playing &&
        getSpatialView(workbook, sheet) === view &&
        useCanvasInk.getState().mode === 'select' &&
        selectedDrawingIds(current).length === 1 &&
        selectedDrawingIds(current)[0] === id &&
        !selectedTopicIds(current).length
      )
    }
    const clear = () => {
      runtime.inkPreviews.delete(key)
      runtime.interacting = false
      runtime.changed()
    }
    const stopSubscriptions: (() => void)[] = []
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', abort)
      window.removeEventListener('blur', abort)
      window.removeEventListener('keydown', keyboard, true)
      target.removeEventListener('lostpointercapture', abort)
      stopSubscriptions.forEach((unsubscribe) => {
        unsubscribe()
      })
      if (target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer)
      cancel.current = null
    }
    const abort = () => {
      stop()
      clear()
    }
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointer) return
      if (!valid()) {
        abort()
        return
      }
      const candidate = independentSpatialInkResize(
        camera,
        viewport,
        rect,
        corner,
        { x: next.clientX - grab.x, y: next.clientY - grab.y },
        stroke.spatialDepth ?? 0,
      )
      if (!candidate || !independentSpatialResizedStroke(stroke, original, candidate)) return
      bounds = candidate
      runtime.inkPreviews.set(key, bounds)
      runtime.changed()
    }
    const finish = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointer) return
      if (!valid()) {
        abort()
        return
      }
      move(next)
      const resized = independentSpatialResizedStroke(stroke, original, bounds)
      if (
        !resized ||
        Math.max(
          Math.abs(bounds.width - original.width),
          Math.abs(bounds.height - original.height),
          Math.abs(bounds.x - original.x),
          Math.abs(bounds.y - original.y),
        ) < 0.01
      ) {
        abort()
        return
      }
      stop()
      runtime.interacting = false
      let stopPending: () => void = () => undefined
      const release = () => {
        stopPending()
        clear()
        if (cancel.current === release) cancel.current = null
      }
      stopPending = useEditor.subscribe((current) => {
        if (
          current.history.document !== document ||
          current.activeSheetId !== sheet ||
          current.workbook.id !== workbook
        )
          release()
      })
      cancel.current = release
      const accepted = useEditor
        .getState()
        .command({ type: 'upsertDrawing', stroke: resized }, release, release)
      if (!accepted || useEditor.getState().history.document !== document) release()
    }
    const keyboard = (next: KeyboardEvent) => {
      if (next.key !== 'Escape' || next.isComposing) return
      next.preventDefault()
      next.stopImmediatePropagation()
      abort()
    }
    const validate = () => {
      if (!valid()) abort()
    }
    cancel.current = abort
    runtime.interacting = true
    target.setPointerCapture(pointer)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', abort)
    window.addEventListener('blur', abort)
    window.addEventListener('keydown', keyboard, true)
    target.addEventListener('lostpointercapture', abort)
    stopSubscriptions.push(
      useEditor.subscribe(validate),
      useSelection.subscribe(validate),
      useSpatialView.subscribe(validate),
      usePresentation.subscribe(validate),
      useCanvasInk.subscribe(validate),
    )
  }
}
