import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { MindMapDocument, Relation } from '@core'
import type { RelationPoint } from '@core/extensions'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { selectAnnotation, useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { translateRelationPath, type RelationDragGeometry } from '@renderer/lib/relationPathDrag'

type DragPart =
  { kind: 'label' } | { kind: 'path' } | { kind: 'control' | 'waypoint'; index: number }
interface Preview {
  document: MindMapDocument
  relation: Relation
}
/** Only pointer-up commits; the document identity protects concurrent edits and Sheet switches. */
export const useRelationDrag = (
  relation: Relation | undefined,
  geometry: RelationDragGeometry | undefined,
) => {
  const flow = useReactFlow()
  const playing = usePresentation((state) => state.playing)
  const sheetId = useEditor((state) => state.activeSheetId)
  const document = useEditor((state) => state.history.document)
  const [preview, setPreview] = useState<Preview | null>(null)
  const cancel = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      cancel.current?.()
    },
    [sheetId, document, playing],
  )
  const begin = (event: PointerEvent, part: DragPart): void => {
    if (!relation || !geometry || event.button !== 0 || usePresentation.getState().playing) return
    const editor = useEditor.getState()
    if (editor.busy || editor.editingId || useAnnotationInteraction.getState().editing) return
    if (part.kind === 'path') selectAnnotation('relation', relation.id)
    event.stopPropagation()
    event.preventDefault()
    cancel.current?.()
    const element =
      part.kind === 'label' && event.target instanceof HTMLElement
        ? (event.target.closest('button') ?? event.currentTarget)
        : event.currentTarget
    const pane = element.closest('.react-flow')
    const bounds = pane?.getBoundingClientRect()
    const initial = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const initialClient = { x: event.clientX, y: event.clientY }
    const baseDocument = editor.history.document
    const baseSheet = editor.activeSheetId
    const original = relation
    let latest = original
    let moved = false
    let retainCapture = false
    element.setPointerCapture(event.pointerId)
    const valid = () => {
      const state = useEditor.getState()
      return (
        state.activeSheetId === baseSheet &&
        state.history.document === baseDocument &&
        !state.busy &&
        !usePresentation.getState().playing
      )
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
      window.removeEventListener('keydown', key, true)
      element.removeEventListener('lostpointercapture', stop)
      if (!retainCapture && element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId)
      cancel.current = null
      setPreview(null)
    }
    const move = (pointer: globalThis.PointerEvent): void => {
      if (pointer.pointerId !== event.pointerId) return
      if (!valid()) {
        stop()
        return
      }
      if (
        Math.hypot(pointer.clientX - initialClient.x, pointer.clientY - initialClient.y) < 4 &&
        !moved
      )
        return
      moved = true
      const point = flow.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY })
      const delta = { x: point.x - initial.x, y: point.y - initial.y }
      if (part.kind === 'label') {
        latest = {
          ...original,
          labelOffset: {
            x: geometry.labelOffset.x + delta.x,
            y: geometry.labelOffset.y + delta.y,
          },
        }
      } else if (part.kind === 'path') {
        latest = translateRelationPath(original, geometry, delta)
      } else {
        const points = part.kind === 'control' ? geometry.controls : geometry.waypoints
        const changed = points.map((entry, index): RelationPoint =>
          geometry.relative(
            index === part.index ? { x: entry.x + delta.x, y: entry.y + delta.y } : entry,
          ),
        )
        latest = {
          ...original,
          ...(part.kind === 'control' ? { controlPoints: changed } : { waypoints: changed }),
        }
      }
      setPreview({ document: baseDocument, relation: latest })
    }
    const finish = (pointer: globalThis.PointerEvent): void => {
      if (pointer.pointerId !== event.pointerId) return
      const inside =
        bounds &&
        pointer.clientX >= bounds.left &&
        pointer.clientX <= bounds.right &&
        pointer.clientY >= bounds.top &&
        pointer.clientY <= bounds.bottom
      const commit = moved && inside && valid()
      stop()
      if (commit) runAnnotationCommand({ type: 'upsertRelation', relation: latest })
    }
    const key = (keyboard: KeyboardEvent): void => {
      if (keyboard.key !== 'Escape') return
      keyboard.preventDefault()
      keyboard.stopImmediatePropagation()
      // Retain capture until physical pointer-up, so Escape cannot click the pane below.
      retainCapture = true
      stop()
    }
    cancel.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
    window.addEventListener('keydown', key, true)
    element.addEventListener('lostpointercapture', stop)
  }
  return { relation: preview?.document === document ? preview.relation : relation, begin }
}
