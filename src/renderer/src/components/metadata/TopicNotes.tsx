import { useEditor } from '../../state/editor'
import { TopicEditor } from '../TopicEditor'
import { Button } from '../ui/button'
import { setMetadataField } from './commands'
import { RichTextEditor } from './RichTextEditor'

export function TopicNotes({ topicId }: { topicId: string }) {
  const topic = useEditor((state) => state.history.document.topics[topicId])
  if (!topic) return null
  const rich = topic.metadata?.notesFormat === 'markdown'
  return (
    <section className="space-y-2.5 border-t border-border py-[18px] first:mt-[18px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-secondary-foreground">备注</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-[10px]"
          aria-pressed={rich}
          onClick={() => {
            setMetadataField(topicId, 'notesFormat', rich ? 'plain' : 'markdown')
          }}
        >
          Markdown 富文本
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
        支持多行文字，离开编辑框后保存。
      </p>
    </section>
  )
}
