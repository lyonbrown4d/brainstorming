import type { Topic } from '@core'
import { useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { isCompositionKey } from '../../state/keyboard'
import { usePresentation } from '../../state/presentation'
import { useEditor } from '../../state/editor'
import { interactAnnotationTopic } from '../../state/annotationInteraction'
import { selectTopic } from '../../state/selection'
import { handleTopicNavigation } from '../../state/editingShortcuts'
import { TopicTitleDisplay } from '../metadata/TopicTitleDisplay'
import { TopicEditor } from '../TopicEditor'

interface SpatialTopicLabelProps {
  readonly topic: Topic
  readonly root: boolean
  readonly depth: number
  readonly selected: boolean
  readonly maxHeight: number
  readonly color: string
  readonly onSelect: (id: string) => void
}

export function SpatialTopicLabel({
  topic,
  root,
  depth,
  selected,
  maxHeight,
  color,
  onSelect,
}: SpatialTopicLabelProps) {
  const label = useRef<HTMLButtonElement>(null)
  // Only this topic changes when its editor opens; draft keystrokes remain inside Lexical.
  const editing = useEditor(
    (state) => state.editingId === topic.id && state.editingSurface === 'spatial',
  )
  const wasEditing = useRef(editing)
  useEffect(() => {
    if (
      selected &&
      (document.activeElement?.hasAttribute('data-spatial-topic-id') ||
        (wasEditing.current && document.activeElement === document.body))
    )
      label.current?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [selected, editing])
  const style = {
    color,
    fontSize: Math.min(topic.style?.fontSize ?? (root ? 24 : 16), 32),
    fontWeight: (topic.style?.bold ?? depth < 2) ? 600 : 400,
    fontStyle: topic.style?.italic ? 'italic' : 'normal',
    maxHeight,
  }
  if (editing)
    return (
      <div
        className="pointer-events-auto w-full rounded-sm text-center leading-snug [&_.topic-editor-shell]:w-full"
        style={style}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onWheel={(event) => {
          event.stopPropagation()
        }}
      >
        <TopicEditor id={topic.id} title={topic.title} surface="spatial" />
      </div>
    )
  return (
    <button
      ref={label}
      data-spatial-topic-id={topic.id}
      type="button"
      className="pointer-events-auto w-full cursor-text overflow-hidden rounded-sm bg-transparent text-center leading-snug text-ellipsis break-words whitespace-pre-line outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      style={style}
      aria-label={`选择主题 ${topic.title}`}
      aria-pressed={selected}
      title={`${topic.title} · 双击编辑`}
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (interactAnnotationTopic(topic.id)) return
        if (event.metaKey || event.ctrlKey || event.shiftKey) selectTopic(topic.id, true)
        else onSelect(topic.id)
      }}
      onDoubleClick={(event) => {
        if (usePresentation.getState().playing) return
        event.stopPropagation()
        useEditor
          .getState()
          .startEdit(
            topic.id,
            undefined,
            'spatial',
            topic.title === '新主题' || topic.title === '游离主题' ? 'all' : 'end',
          )
      }}
      onKeyDown={(event) => {
        if (usePresentation.getState().playing) return
        if (event.defaultPrevented) return
        if (isCompositionKey(event.nativeEvent)) {
          flushSync(() => {
            useEditor.getState().startEdit(topic.id, '', 'spatial', 'end')
          })
          event.stopPropagation()
          return
        }
        if (handleTopicNavigation(event.nativeEvent, topic.id)) event.stopPropagation()
        else if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
          event.preventDefault()
          useEditor.getState().startEdit(topic.id, event.key, 'spatial', 'end')
        }
      }}
    >
      <TopicTitleDisplay topic={topic} />
    </button>
  )
}
