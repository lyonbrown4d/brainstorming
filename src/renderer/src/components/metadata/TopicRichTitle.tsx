import { useEditor } from '../../state/editor'
import { TopicEditor } from '../TopicEditor'
import { Button } from '../ui/button'
import { setMetadataField } from './commands'
import { RichTextEditor } from './RichTextEditor'

export function TopicRichTitle({ topicId }: { topicId: string }) {
  const topic = useEditor((state) => state.history.document.topics[topicId])
  if (!topic) return null
  const rich = topic.metadata?.richTitle !== undefined
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-secondary-foreground">主题名称</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-[10px]"
          aria-pressed={rich}
          onClick={() => {
            setMetadataField(topicId, 'richTitle', rich ? undefined : topic.title)
          }}
        >
          局部富文本
        </Button>
      </div>
      {rich ? (
        <RichTextEditor
          key={`rich:${topicId}`}
          topicId={topicId}
          source={topic.metadata.richTitle}
          title
        />
      ) : (
        <TopicEditor key={topicId} id={topicId} title={topic.title} surface="inspector" />
      )}
    </div>
  )
}
