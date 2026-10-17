import { useMessages } from '@renderer/i18n/useMessages'

import { useEditor } from '@renderer/state/editor'
import { TopicEditor } from '@renderer/components/TopicEditor'
import { Button } from '@renderer/components/ui/button'
import { setMetadataField } from '@renderer/components/metadata/commands'
import { RichTextEditor } from '@renderer/components/metadata/RichTextEditor'

export const TopicRichTitle = ({ topicId }: { topicId: string }) => {
  const { translate } = useMessages()

  const topic = useEditor((state) => state.history.document.topics[topicId])
  if (!topic) return null
  const rich = topic.metadata?.richTitle !== undefined
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-secondary-foreground">{translate('topicTitle')}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-[10px]"
          aria-pressed={rich}
          onClick={() => {
            setMetadataField(topicId, 'richTitle', rich ? undefined : topic.title)
          }}
        >
          {translate('richText')}
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
