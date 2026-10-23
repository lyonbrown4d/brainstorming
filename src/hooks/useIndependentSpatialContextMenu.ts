import { useRef, useState, type MouseEvent } from 'react'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import type { CanvasMenuTarget } from '@renderer/hooks/useCanvasContextMenu'
import { useEditor } from '@renderer/state/editor'
import {
  selectedTopicIds,
  selectedDrawingIds,
  selectTopic,
  selectDrawing,
} from '@renderer/state/selection'
import { selectAnnotation, useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { usePresentation } from '@renderer/state/presentation'

export const useIndependentSpatialContextMenu = (runtime: IndependentSpatialRuntime) => {
  const [target, setTarget] = useState<CanvasMenuTarget | null>(null)
  const identity = useRef<{ documentId: string; sheetId: string } | null>(null)
  const busy = useEditor((state) => state.busy)
  const playing = usePresentation((state) => state.playing)
  const guard = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return
    if (event.target.closest('input,textarea,[contenteditable="true"],button')) {
      event.stopPropagation()
      return
    }
    if (
      !runtime.pick(event.clientX, event.clientY) &&
      !event.target.closest('[data-annotation-id]')
    ) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  const prepare = (event: MouseEvent<HTMLDivElement>) => {
    const editor = useEditor.getState()
    if (editor.busy || editor.editingId || playing) {
      event.preventDefault()
      return
    }
    runtime.freezeCamera()
    identity.current = { documentId: editor.history.document.id, sheetId: editor.activeSheetId }
    const annotation =
      event.target instanceof Element ? event.target.closest('[data-annotation-id]') : null
    const kind = annotation?.getAttribute('data-annotation-kind'),
      annotationId = annotation?.getAttribute('data-annotation-id')
    if (annotationId && (kind === 'relation' || kind === 'group' || kind === 'callout')) {
      selectAnnotation(kind, annotationId)
      setTarget({ kind, id: annotationId })
      return
    }
    const hit = runtime.pick(event.clientX, event.clientY)
    if (!hit) {
      event.preventDefault()
      return
    }
    useAnnotationInteraction.setState({
      selected: null,
      editing: false,
      relationMode: false,
      fromId: null,
      floating: false,
    })
    if (hit.kind === 'topic') {
      if (!selectedTopicIds(editor).includes(hit.id)) selectTopic(hit.id)
      else useEditor.setState({ selectedId: hit.id })
      setTarget({ kind: 'topic' })
    } else {
      if (!selectedDrawingIds(editor).includes(hit.drawingId)) selectDrawing(hit.drawingId, false)
      setTarget({ kind: 'ink' })
    }
  }
  const run = (action: () => void) => {
    const state = useEditor.getState()
    if (
      !state.busy &&
      !usePresentation.getState().playing &&
      identity.current?.documentId === state.history.document.id &&
      identity.current.sheetId === state.activeSheetId
    )
      action()
  }
  return { target, guard, prepare, run, disabled: busy || playing }
}
