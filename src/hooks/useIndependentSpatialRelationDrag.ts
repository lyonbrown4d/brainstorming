import { useEffect, useRef, type PointerEvent } from 'react'
import type { Relation } from '@core'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { independentSpatialRelationGeometry } from '@renderer/lib/independentSpatialRelationGeometry'
import { translateRelationPath } from '@renderer/lib/relationPathDrag'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { selectAnnotation, useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'

type Part =
  | { kind: 'path' }
  | { kind: 'label' }
  | { kind: 'control'; index: number }
  | { kind: 'waypoint'; index: number }
export const useIndependentSpatialRelationDrag = (runtime: IndependentSpatialRuntime) => {
  const cancel = useRef<(() => void) | null>(null)
  useEffect(() => () => cancel.current?.(), [runtime])
  return (event: PointerEvent, original: Relation, part: Part) => {
    const editor = useEditor.getState()
    if (
      event.button !== 0 ||
      editor.busy ||
      editor.editingId ||
      usePresentation.getState().playing ||
      useAnnotationInteraction.getState().editing
    )
      return
    const geometry = independentSpatialRelationGeometry(runtime, original)
    if (!geometry) return
    event.stopPropagation()
    event.preventDefault()
    cancel.current?.()
    runtime.freezeCamera()
    selectAnnotation('relation', original.id)
    const document = editor.history.document,
      sheetId = editor.activeSheetId,
      workbookId = editor.workbook.id
    const initial = { x: event.clientX, y: event.clientY }
    const control =
      part.kind === 'control'
        ? geometry.controls[part.index]
        : part.kind === 'waypoint'
          ? geometry.waypoints[part.index]
          : geometry.label
    const unit = geometry.project(control ?? geometry.midpoint).unit
    const target = event.currentTarget
    let latest = original,
      moved = false
    const clear = () => {
      runtime.relationPreviews.delete(original.id)
      runtime.changed()
    }
    const valid = () => {
      const state = useEditor.getState()
      return (
        state.workbook.id === workbookId &&
        state.activeSheetId === sheetId &&
        state.history.document === document &&
        !state.busy &&
        !usePresentation.getState().playing
      )
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', abort)
      window.removeEventListener('blur', abort)
      window.removeEventListener('keydown', key, true)
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
      cancel.current = null
    }
    const abort = () => {
      stop()
      clear()
    }
    const move = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== event.pointerId) return
      if (!valid()) {
        abort()
        return
      }
      const dx = pointer.clientX - initial.x,
        dy = pointer.clientY - initial.y
      if (!moved && Math.hypot(dx, dy) < 4) return
      moved = true
      const delta = { x: dx * unit, y: dy * unit }
      if (part.kind === 'path') latest = translateRelationPath(original, geometry, delta)
      else if (part.kind === 'label')
        latest = {
          ...original,
          labelOffset: { x: geometry.labelOffset.x + delta.x, y: geometry.labelOffset.y + delta.y },
        }
      else {
        const points = part.kind === 'control' ? geometry.controls : geometry.waypoints
        const changed = points.map((point, index) =>
          geometry.relative(
            index === part.index ? { x: point.x + delta.x, y: point.y + delta.y } : point,
          ),
        )
        latest = {
          ...original,
          ...(part.kind === 'control' ? { controlPoints: changed } : { waypoints: changed }),
        }
      }
      runtime.relationPreviews.set(original.id, latest)
      runtime.changed()
    }
    const up = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== event.pointerId) return
      move(pointer)
      const commit = moved && valid()
      stop()
      if (!commit || !runAnnotationCommand({ type: 'upsertRelation', relation: latest })) clear()
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
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', abort)
    window.addEventListener('blur', abort)
    window.addEventListener('keydown', key, true)
  }
}
