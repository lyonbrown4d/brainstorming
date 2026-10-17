import { useMessages } from '@renderer/i18n/useMessages'

import { Download, ImagePlus, Paperclip, Trash2 } from 'lucide-react'
import type { Command } from '@core'
import { useEditor } from '@renderer/state/editor'
import { exportTopicAsset, importTopicAssets } from '@renderer/state/assets'
import { TopicNotes } from '@renderer/components/metadata/TopicNotes'
import { TopicImage } from '@renderer/components/TopicImage'
import { TopicImagePreview } from '@renderer/components/TopicImagePreview'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'

const removeContent = (command: Command): void => {
  const state = useEditor.getState()
  if (state.busy) return
  state.commitDraft()
  state.command(command)
}

const TopicAttachment = ({ topicId, assetId }: { topicId: string; assetId: string }) => {
  const { translate } = useMessages()

  const asset = useEditor((state) => state.history.document.assets?.[assetId])
  const busy = useEditor((state) => state.busy)
  if (!asset) return null
  return (
    <li className="topic-attachment flex min-w-0 items-center gap-[5px] text-secondary-foreground [&>svg]:shrink-0">
      <Paperclip size={14} aria-hidden />
      <span className="topic-attachment-name min-w-0 flex-1 truncate text-xs" title={asset.name}>
        {asset.name}
      </span>
      <Button
        className="h-[31px] w-[27px] shrink-0 gap-[5px] p-0 text-xs"
        variant="ghost"
        size="icon"
        aria-label={translate('saveAttachmentAsValue0', { value0: asset.name })}
        disabled={busy}
        onClick={() => {
          void exportTopicAsset(asset)
        }}
      >
        <Download size={14} />
      </Button>
      <Button
        className="h-[31px] w-[27px] shrink-0 gap-[5px] p-0 text-xs"
        variant="ghost"
        size="icon"
        aria-label={translate('removeAttachmentValue0', { value0: asset.name })}
        disabled={busy}
        onClick={() => {
          removeContent({ type: 'removeTopicAttachment', topicId, assetId })
        }}
      >
        <Trash2 size={14} />
      </Button>
    </li>
  )
}

export const TopicContentPanel = ({ topicId }: { topicId: string }) => {
  const { translate } = useMessages()

  const topic = useEditor((state) => state.history.document.topics[topicId])
  const busy = useEditor((state) => state.busy)
  if (!topic) return null
  return (
    <div className="topic-content-panel">
      <TopicNotes topicId={topicId} />
      <section className="format-group border-t border-border py-[18px] [&_h3]:mb-2.5 [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:text-secondary-foreground first:mt-[18px]">
        <h3>{translate('image')}</h3>
        {topic.image && (
          <TopicImage
            image={topic.image}
            className="topic-image-preview mx-auto mb-3 block max-w-full rounded-[5px] object-contain"
          />
        )}
        <div className="topic-content-actions flex flex-wrap gap-2">
          <Button
            className="h-[31px] gap-[5px] px-[9px] text-xs"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void importTopicAssets(topicId, 'image')
            }}
          >
            <ImagePlus size={14} />
            {topic.image ? translate('replaceImage') : translate('addImage')}
          </Button>
          {topic.image && <TopicImagePreview image={topic.image} />}
          {topic.image && (
            <Button
              className="h-[31px] gap-[5px] px-[9px] text-xs"
              variant="ghost"
              disabled={busy}
              aria-label={translate('removeImage')}
              onClick={() => {
                removeContent({ type: 'removeTopicImage', topicId })
              }}
            >
              <Trash2 size={14} />
              {translate('remove')}
            </Button>
          )}
        </div>
      </section>
      <section className="format-group border-t border-border py-[18px] [&_h3]:mb-2.5 [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:text-secondary-foreground first:mt-[18px]">
        <h3>
          {translate('attachments')}
          {Boolean(topic.attachments?.length) && (
            <Badge variant="secondary" className="topic-attachment-count ml-[7px] text-[10px]">
              {topic.attachments?.length}
            </Badge>
          )}
        </h3>
        {topic.attachments?.length ? (
          <ScrollArea
            className="topic-attachment-scroll mb-3"
            style={{ height: Math.min(topic.attachments.length * 38, 190) }}
            aria-label={translate('topicAttachmentList')}
            tabIndex={0}
          >
            <ul className="topic-attachments m-0 flex list-none flex-col gap-[7px] p-0">
              {topic.attachments.map((assetId) => (
                <TopicAttachment key={assetId} topicId={topicId} assetId={assetId} />
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <p className="topic-content-empty mb-3 text-[11px] leading-relaxed text-muted-foreground">
            {translate('noAttachmentsYet')}
          </p>
        )}
        <Button
          className="h-[31px] gap-[5px] px-[9px] text-xs"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void importTopicAssets(topicId, 'attachment')
          }}
        >
          <Paperclip size={14} />
          {translate('addAttachment')}
        </Button>
      </section>
    </div>
  )
}
