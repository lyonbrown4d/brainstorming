import type { Topic } from '@core'
import { useEditor } from '../../state/editor'
import { isCompositionKey } from '../../state/keyboard'
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
  // Only this topic changes when its editor opens; draft keystrokes remain inside Lexical.
  const editing = useEditor(
    (state) => state.editingId === topic.id && state.editingSurface === 'spatial',
  )
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
        onSelect(topic.id)
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        useEditor.getState().startEdit(topic.id, undefined, 'spatial')
      }}
      onKeyDown={(event) => {
        if (event.key !== 'F2' || isCompositionKey(event.nativeEvent)) return
        event.preventDefault()
        event.stopPropagation()
        useEditor.getState().startEdit(topic.id, undefined, 'spatial')
      }}
    >
      {topic.title || '未命名主题'}
    </button>
  )
}
