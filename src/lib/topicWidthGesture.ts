import { measureTopic } from '@layout'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { getSpatialView, useSpatialView } from '@renderer/state/spatialView'
import { hasNativeEditor } from '@renderer/state/nativeEditorQueue'
import { useTopicWidthPreview, type TopicWidthPreview } from '@renderer/state/topicWidthPreview'

/** Width is a topic style edit in both canvases; intermediate boxes remain session data. */
export const createTopicWidthGesture = (
  id: string,
  preview: (value: TopicWidthPreview) => void,
  restore: () => void,
  fixedEdge: TopicWidthPreview['fixedEdge'] = 'left',
) => {
  const source = useEditor.getState()
  const document = source.history.document
  const topic = document.topics[id]
  if (!topic || source.busy || source.editingId || usePresentation.getState().playing) return null
  const view = getSpatialView(source.workbook.id, source.activeSheetId)
  const original = measureTopic(topic.title, id === document.rootId, topic.style?.fontSize, topic)
  const scale = topic.style?.scale ?? 1
  let width = topic.style?.width ?? original.width / scale
  let closed = false
  let submitted = false
  let lastPreview: TopicWidthPreview | null = null
  const valid = () => {
    const current = useEditor.getState()
    return (
      current.workbook.id === source.workbook.id &&
      current.activeSheetId === source.activeSheetId &&
      current.history.document === document &&
      !current.busy &&
      !current.editingId &&
      !usePresentation.getState().playing &&
      useCanvasInk.getState().mode === 'select' &&
      getSpatialView(source.workbook.id, source.activeSheetId) === view
    )
  }
  const clear = () => {
    if (lastPreview && useTopicWidthPreview.getState().preview === lastPreview)
      useTopicWidthPreview.setState({ preview: null })
    restore()
  }
  const stop = () => {
    unsubscribeEditor()
    unsubscribeView()
    unsubscribePlaying()
    unsubscribeInk()
    window.removeEventListener('blur', cancel)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key, true)
  }
  const cancel = () => {
    if (submitted) {
      clear()
      return
    }
    if (closed) return
    closed = true
    stop()
    clear()
  }
  const key = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing) return
    event.preventDefault()
    event.stopImmediatePropagation()
    cancel()
  }
  const check = () => {
    if (!valid()) cancel()
  }
  const unsubscribeEditor = useEditor.subscribe(check)
  const unsubscribeView = useSpatialView.subscribe(check)
  const unsubscribePlaying = usePresentation.subscribe(check)
  const unsubscribeInk = useCanvasInk.subscribe(check)
  window.addEventListener('blur', cancel)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key, true)
  return {
    originalWidth: width,
    active: () => !closed && !submitted && valid(),
    update: (next: number) => {
      if (closed || submitted || !valid() || !Number.isFinite(next)) return
      width = Math.max(80, Math.min(1200, Math.round(next)))
      const candidate = { ...topic, style: { ...topic.style, width } }
      const size = measureTopic(
        candidate.title,
        id === document.rootId,
        topic.style?.fontSize,
        candidate,
      )
      const value = { topic: candidate, ...size, fixedEdge }
      lastPreview = value
      useTopicWidthPreview.setState({ preview: value })
      preview(value)
    },
    finish: () => {
      if (submitted) return
      if (closed) {
        clear()
        return
      }
      if (!valid() || width === (topic.style?.width ?? original.width / scale)) {
        cancel()
        return
      }
      submitted = true
      closed = true
      stop()
      const accepted = useEditor
        .getState()
        .command(
          { type: 'setTopicStyle', topicId: id, style: { ...topic.style, width } },
          clear,
          clear,
        )
      if (!accepted || !hasNativeEditor()) clear()
    },
    cancel,
  }
}
export type TopicWidthGesture = NonNullable<ReturnType<typeof createTopicWidthGesture>>
