import type { Topic } from '@core'
import { ImagePlus } from 'lucide-react'
import { showsTopicNotes, topicNotesPreview } from '@shared/topic-shapes'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import { importTopicAssets } from '@renderer/state/assets'
import { useEditor } from '@renderer/state/editor'

const EmptyTopicImage = ({ topicId }: { topicId: string }) => {
  const { translate } = useMessages()
  const busy = useEditor((state) => state.busy)
  return (
    <Button
      variant="ghost"
      className="nodrag nopan mx-3 mt-2 h-11 shrink-0 gap-1.5 border border-dashed border-current/25 px-3 text-xs text-inherit"
      disabled={busy}
      title={translate('appearanceImageEmpty')}
      onClick={(event) => {
        event.stopPropagation()
        void importTopicAssets(topicId, 'image')
      }}
    >
      <ImagePlus className="size-4" />
      {translate('addImage')}
    </Button>
  )
}

export const TopicAppearanceContent = ({ topic }: { topic: Topic }) => {
  if (topic.style?.shape === 'image' && !topic.image) return <EmptyTopicImage topicId={topic.id} />
  if (showsTopicNotes(topic.style?.shape) && topic.notes)
    return (
      <p className="mx-4 mb-2 line-clamp-2 h-10 shrink-0 overflow-hidden text-xs leading-5 break-words opacity-70">
        {topicNotesPreview(topic.notes)}
      </p>
    )
  return null
}
