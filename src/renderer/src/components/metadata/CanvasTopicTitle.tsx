import type { Topic } from '@core'
import { useEditor } from '@renderer/state/editor'
import { TopicEditor } from '@renderer/components/TopicEditor'
import { TopicTitleDisplay } from '@renderer/components/metadata/TopicTitleDisplay'

/** Keep Lexical mounted throughout typing and composition while showing stored inline formatting. */
export const CanvasTopicTitle = ({ topic }: { topic: Topic }) => {
  const editing = useEditor(
    (state) => state.editingId === topic.id && state.editingSurface === 'canvas',
  )
  const preview = Boolean(topic.metadata?.richTitle) && !editing
  if (!topic.metadata?.richTitle) return <TopicEditor id={topic.id} title={topic.title} />
  return (
    <div className="relative h-full w-full">
      <div className={`h-full ${preview ? 'opacity-0' : ''}`}>
        <TopicEditor id={topic.id} title={topic.title} />
      </div>
      {preview && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <TopicTitleDisplay topic={topic} />
        </div>
      )}
    </div>
  )
}
