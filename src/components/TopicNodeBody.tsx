import type { Topic } from '@core'
import { showsTopicNotes } from '@shared/topic-shapes'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { TopicMarkerLayout } from '@renderer/components/metadata/TopicMarkerLayout'
import { CanvasTopicTitle } from '@renderer/components/metadata/CanvasTopicTitle'
import { TopicTitleDisplay } from '@renderer/components/metadata/TopicTitleDisplay'
import { TopicMetadataBadges } from '@renderer/components/metadata/TopicMetadataBadges'
import { TopicImage } from '@renderer/components/TopicImage'
import { TopicContentIndicators } from '@renderer/components/TopicContentIndicators'
import { TopicAppearanceContent } from '@renderer/components/TopicAppearanceContent'

export const TopicNodeBody = ({
  topic,
  root,
  branch,
  primary,
  editing,
}: {
  topic: Topic
  root: boolean
  branch: boolean
  primary: boolean
  editing: boolean
}) => {
  const { translate } = useMessages()
  const id = topic.id
  const style = topic.style
  const shape = style?.shape ?? 'rounded'
  const hasContent =
    Boolean(topic.image) ||
    Boolean(topic.notes) ||
    Boolean(topic.attachments?.length) ||
    Boolean(topic.metadata)
  return (
    <>
      <TopicMarkerLayout topicId={topic.id} metadata={topic.metadata}>
        {topic.image && (
          <TopicImage
            image={topic.image}
            className="topic-embedded-image mx-auto mt-3 block shrink-0 rounded-[5px] object-contain"
          />
        )}
        <div
          className={`topic-title flex min-w-0 w-full items-center justify-center px-[17px] py-2.5 text-center leading-normal [&>span]:break-words [&>span]:whitespace-pre-wrap ${hasContent ? 'h-auto min-h-0 flex-1' : 'h-full'}`}
          style={{
            fontSize: style?.fontSize ?? (root ? 24 : 16),
            fontWeight: (style?.bold ?? (root || branch)) ? 600 : 400,
            fontStyle: style?.italic ? 'italic' : 'normal',
          }}
          onDoubleClick={() => {
            if (usePresentation.getState().playing) return
            useEditor
              .getState()
              .startEdit(
                id,
                undefined,
                'canvas',
                topic.title === translate('newTopic') || topic.title === translate('floatingTopic')
                  ? 'all'
                  : 'end',
              )
          }}
        >
          {primary || editing ? (
            <CanvasTopicTitle topic={topic} />
          ) : (
            <TopicTitleDisplay topic={topic} />
          )}
        </div>
      </TopicMarkerLayout>
      {((shape === 'image' && !topic.image) || (showsTopicNotes(shape) && topic.notes)) && (
        <TopicAppearanceContent topic={topic} />
      )}
      <TopicMetadataBadges metadata={topic.metadata} topicId={id} />
      <TopicContentIndicators
        topicId={id}
        hasNotes={Boolean(topic.notes)}
        attachmentCount={topic.attachments?.length ?? 0}
      />
    </>
  )
}
