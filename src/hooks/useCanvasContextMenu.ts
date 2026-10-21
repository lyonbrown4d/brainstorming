import { getSpatialView } from '@renderer/state/spatialView'
import { useRef, useState, type MouseEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import {
  selectDrawing,
  selectedDrawingIds,
  selectedTopicIds,
  selectTopic,
  setCanvasSelection,
} from '@renderer/state/selection'
import {
  selectAnnotation,
  useAnnotationInteraction,
  type AnnotationKind,
} from '@renderer/state/annotationInteraction'

export type CanvasMenuTarget =
  | { readonly kind: 'pane'; readonly x: number; readonly y: number }
  | { readonly kind: 'topic' | 'ink' }
  | { readonly kind: AnnotationKind; readonly id: string }

/** Radix owns menu placement/focus; this adapter resolves the canvas command target. */
export const useCanvasContextMenu = () => {
  const flow = useReactFlow<CanvasFlowNode>()
  const [target, setTarget] = useState<CanvasMenuTarget | null>(null)
  const identity = useRef<{ documentId: string; sheetId: string } | null>(null)
  const busy = useEditor((state) => state.busy)
  const playing = usePresentation((state) => state.playing)
  const guard = (event: MouseEvent<HTMLDivElement>): void => {
    const element = event.target
    if (!(element instanceof Element)) return
    const state = useEditor.getState()
    if (
      element.classList.contains('react-flow__pane') &&
      getSpatialView(state.workbook.id, state.activeSheetId).mode === '3d'
    ) {
      // Blank-space right drag belongs to the 3D camera; topic menus remain available.
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const editor = element.closest('[contenteditable="true"]')
    const inactiveTitle = editor?.matches('.topic-input') && !editor.closest('.is-editing')
    const annotation = element.closest('[data-annotation-kind][data-annotation-id]')
    if (
      busy ||
      playing ||
      element.closest('input, textarea') ||
      (editor && !inactiveTitle) ||
      (element.closest('button') && !annotation) ||
      (!element.closest('.react-flow__node, .react-flow__edge') &&
        !annotation &&
        !element.classList.contains('react-flow__pane'))
    )
      event.stopPropagation()
  }
  // Selection can replace the clicked title DOM; update it in bubble after Radix's event path exists.
  const prepare = (event: MouseEvent<HTMLDivElement>) => {
    const element = event.target

    if (!(element instanceof Element)) return
    // Text editing keeps the platform's text-selection and spelling menu.
    const annotation = element.closest('[data-annotation-kind][data-annotation-id]')
    const editor = element.closest('[contenteditable="true"]')
    const inactiveTitle = editor?.matches('.topic-input') && !editor.closest('.is-editing')
    if (
      element.closest('input, textarea') ||
      (editor && !inactiveTitle) ||
      (element.closest('button') && !annotation)
    ) {
      event.stopPropagation()
      return
    }
    useEditor.getState().commitDraft()
    const state = useEditor.getState()
    if (state.editingId || state.busy || playing) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    identity.current = { documentId: state.history.document.id, sheetId: state.activeSheetId }
    const nodeId = element.closest('.react-flow__node')?.getAttribute('data-id')
    const node = nodeId ? flow.getNode(nodeId) : undefined
    const edgeId = element.closest('.react-flow__edge')?.getAttribute('data-id')
    const kind = annotation?.getAttribute('data-annotation-kind')
    const annotationId = annotation?.getAttribute('data-annotation-id')
    if (annotationId && (kind === 'relation' || kind === 'group' || kind === 'callout')) {
      selectAnnotation(kind, annotationId)
      setTarget({ kind, id: annotationId })
    } else if (edgeId?.startsWith('relation-')) {
      const id = edgeId.slice('relation-'.length)
      selectAnnotation('relation', id)
      setTarget({ kind: 'relation', id })
    } else if (node) {
      useAnnotationInteraction.setState({
        selected: null,
        editing: false,
        relationMode: false,
        fromId: null,
        floating: false,
      })
      // Right-clicking a selected member preserves the entire working selection.
      if (node.type === 'ink') {
        if (!selectedDrawingIds(state).includes(node.data.stroke.id))
          selectDrawing(node.data.stroke.id, false)
        setTarget({ kind: 'ink' })
      } else {
        if (!selectedTopicIds(state).includes(node.id)) selectTopic(node.id)
        else useEditor.setState({ selectedId: node.id })
        setTarget({ kind: 'topic' })
      }
    } else if (element.classList.contains('react-flow__pane')) {
      useAnnotationInteraction.setState({
        selected: null,
        editing: false,
        relationMode: false,
        fromId: null,
        floating: false,
      })
      setCanvasSelection([], [])
      setTarget({
        kind: 'pane',
        ...flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      })
    } else {
      event.stopPropagation()
    }
  }
  const run = (action: () => void): void => {
    const state = useEditor.getState()
    if (
      state.busy ||
      usePresentation.getState().playing ||
      identity.current?.documentId !== state.history.document.id ||
      identity.current.sheetId !== state.activeSheetId
    )
      return
    action()
  }
  return { target, guard, prepare, run, disabled: busy || playing }
}
