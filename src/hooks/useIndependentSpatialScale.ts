import { useEffect, useRef, type PointerEvent } from 'react'
import { applyCommand } from '@core'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { independentSpatialPointerPlane } from '@renderer/lib/independentSpatialGestureGeometry'
import { fetchNativeSpatialLayout } from '@renderer/lib/nativeSpatialLayout'
import { useEditor } from '@renderer/state/editor'
import { getSpatialView } from '@renderer/state/spatialView'
import { usePresentation } from '@renderer/state/presentation'

export type IndependentSpatialCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
/** The grip preview stays in Three; Rust measures the final scaled document before one command. */
export const useIndependentSpatialScale = (runtime: IndependentSpatialRuntime) => {
  const cancel = useRef<(() => void) | null>(null)
  useEffect(() => () => cancel.current?.(), [runtime])
  return (event: PointerEvent, id: string, corner: IndependentSpatialCorner) => {
    if (event.button !== 0 || !runtime.camera || !runtime.canvas) return
    const editor = useEditor.getState()
    if (editor.busy || editor.editingId || usePresentation.getState().playing) return
    const node = runtime.model.layout.nodes.find((item) => item.id === id)
    const rect = runtime.rectangles().find((item) => item.id === id)
    const topic = editor.history.document.topics[id]
    if (!node || !rect || !topic) return
    event.preventDefault()
    event.stopPropagation()
    cancel.current?.()
    runtime.freezeCamera()
    const base = editor.history.document
    const workbookId = editor.workbook.id,
      sheetId = editor.activeSheetId
    const view = getSpatialView(workbookId, sheetId)
    const center = {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
      z: runtime.model.depths[id] ?? 0,
    }
    const plane = independentSpatialPointerPlane(
      runtime.camera,
      runtime.canvas.getBoundingClientRect(),
      center,
    )
    const sx = corner.endsWith('left') ? -1 : 1,
      sy = corner.startsWith('top') ? -1 : 1
    const opposite = {
      x: rect.x + (sx < 0 ? rect.width : 0),
      y: rect.y + (sy < 0 ? rect.height : 0),
    }
    const original = topic.style?.scale ?? 1
    let ratio = 1,
      pending = false,
      cancelled = false
    let desired = center
    const target = event.currentTarget
    const valid = () => {
      const current = useEditor.getState()
      return (
        current.workbook.id === workbookId &&
        current.activeSheetId === sheetId &&
        current.history.document === base &&
        !current.busy &&
        !usePresentation.getState().playing
      )
    }
    const clearPreview = () => {
      runtime.scales.delete(id)
      runtime.offsets.delete(id)
      runtime.changed()
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', abort)
      window.removeEventListener('blur', abort)
      window.removeEventListener('keydown', key, true)
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
      if (cancel.current === abort) cancel.current = null
    }
    const abort = () => {
      cancelled = true
      stop()
      clearPreview()
    }
    const move = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== event.pointerId || pending) return
      if (!valid()) {
        abort()
        return
      }
      const diagonal = { x: sx * rect.width, y: sy * rect.height }
      ratio = Math.max(
        0.5 / original,
        Math.min(
          3 / original,
          ((pointer.clientX - opposite.x) * diagonal.x +
            (pointer.clientY - opposite.y) * diagonal.y) /
            (rect.width ** 2 + rect.height ** 2),
        ),
      )
      const next = plane({
        x: opposite.x + (diagonal.x * ratio) / 2,
        y: opposite.y + (diagonal.y * ratio) / 2,
      })
      if (!next) return
      desired = next
      runtime.scales.set(id, ratio)
      runtime.offsets.set(id, {
        x: desired.x - center.x,
        y: desired.y - center.y,
        z: desired.z - center.z,
      })
      runtime.changed()
    }
    const finish = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== event.pointerId || pending) return
      move(pointer)
      if (cancelled || !valid()) {
        abort()
        return
      }
      const scale = Math.round(original * ratio * 100) / 100
      if (scale === original) {
        abort()
        return
      }
      pending = true
      const candidate = applyCommand(base, {
        type: 'setTopicStyle',
        topicId: id,
        style: { ...topic.style, scale },
      })
      void fetchNativeSpatialLayout(candidate, sheetId, view)
        .then(({ layout, depths }) => {
          if (cancelled || !valid()) {
            abort()
            return
          }
          const next = layout.nodes.find((item) => item.id === id)
          if (!next) {
            abort()
            return
          }
          const style = {
            ...topic.style,
            scale,
            offsetX: (topic.style?.offsetX ?? 0) + desired.x - next.x - next.width / 2,
            offsetY: (topic.style?.offsetY ?? 0) + desired.y - next.y - next.height / 2,
            spatialDepth: (topic.style?.spatialDepth ?? 0) + desired.z - (depths[id] ?? 0),
          }
          stop()
          if (
            !useEditor
              .getState()
              .command({ type: 'setTopicStyle', topicId: id, style }, clearPreview)
          )
            clearPreview()
        })
        .catch(abort)
    }
    const key = (keyboard: KeyboardEvent) => {
      if (keyboard.key === 'Escape' && !keyboard.isComposing) {
        keyboard.preventDefault()
        keyboard.stopImmediatePropagation()
        abort()
      }
    }
    cancel.current = abort
    target.setPointerCapture(event.pointerId)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', abort)
    window.addEventListener('blur', abort)
    window.addEventListener('keydown', key, true)
  }
}
