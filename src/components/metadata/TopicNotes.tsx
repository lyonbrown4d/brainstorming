import { useTopicPropertyFocusTarget } from '@renderer/hooks/useTopicPropertyFocus'
import { useMessages } from '@renderer/i18n/useMessages'

import { useEditor } from '@renderer/state/editor'
import { TopicEditor } from '@renderer/components/TopicEditor'
import { Button } from '@renderer/components/ui/button'
import { setMetadataField } from '@renderer/components/metadata/commands'
import { RichTextEditor } from '@renderer/components/metadata/RichTextEditor'

export const TopicNotes = ({ topicId }: { topicId: string }) => {
  const focusRef = useTopicPropertyFocusTarget(topicId, 'notes')
  const { translate } = useMessages()

  const topic = useEditor((state) => state.history.document.topics[topicId])
  if (!topic) return null
  const rich = topic.metadata?.notesFormat === 'markdown'
  return (
    <section
      ref={focusRef}
      className="space-y-2.5 border-t border-border py-[18px] first:mt-[18px]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-secondary-foreground">{translate('notes')}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-[10px]"
          aria-pressed={rich}
          onClick={() => {
            setMetadataField(topicId, 'notesFormat', rich ? 'plain' : 'markdown')
          }}
        >
          {translate('markdownRichText')}
        </Button>
      </div>
      {rich ? (
        <RichTextEditor
          key={`notes-rich:${topicId}`}
          topicId={topicId}
          source={topic.notes ?? ''}
        />
      ) : (
        <TopicEditor id={topicId} title={topic.notes ?? ''} surface="notes" />
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {translate('supportsMultipleLinesSavesWhenYouLeave')}
      </p>
    </section>
  )
}
