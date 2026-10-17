import { useMessages } from '@renderer/i18n/useMessages'

import { AudioLines, CheckCircle2, Circle, Link2, Sigma, Tag } from 'lucide-react'
import type { TopicMetadata } from '@core'
import { Button } from '@renderer/components/ui/button'
import { openTopicLink } from '@renderer/components/metadata/LinkPanel'
export const TopicMetadataBadges = ({ metadata }: { metadata: TopicMetadata | undefined }) => {
  const { translate } = useMessages()

  if (!metadata) return null
  const { task, labels = [], link, equation, audioAssetId } = metadata
  if (!task && !labels.length && !link && !equation && !audioAssetId) return null
  return (
    <div
      className="nodrag nopan flex h-6 max-w-full shrink-0 items-center justify-center gap-1 overflow-hidden px-2 text-[10px] opacity-85"
      aria-label={translate('topicLabelsAndTasks')}
    >
      {task && (
        <span
          className="flex shrink-0 items-center gap-0.5"
          title={translate('taskValue0value1value2', {
            value0: task.done ? translate('completed') : translate('incomplete'),
            value1: task.priority ? translate('priorityValue0', { value0: task.priority }) : '',
            value2: task.due ? translate('dueValue0', { value0: task.due }) : '',
          })}
        >
          {task.done ? (
            <CheckCircle2 className="size-3" aria-label={translate('taskCompleted')} />
          ) : (
            <Circle className="size-3" aria-label={translate('taskIncomplete')} />
          )}
          {task.progress !== undefined && `${task.progress}%`}
          {task.priority && <span>P{task.priority}</span>}
        </span>
      )}
      {labels.length > 0 && (
        <span className="flex min-w-0 items-center gap-0.5" title={labels.join('、')}>
          <Tag className="size-3 shrink-0" />
          <span className="max-w-24 truncate">{labels[0]}</span>
          {labels.length > 1 && `+${labels.length - 1}`}
        </span>
      )}
      {link && (
        <Button
          className="pointer-events-auto size-5 shrink-0 p-0 text-inherit"
          variant="ghost"
          size="icon"
          aria-label={translate('openTopicLink')}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            openTopicLink(link)
          }}
        >
          <Link2 className="size-3" />
        </Button>
      )}
      {equation && <Sigma className="size-3 shrink-0" aria-label={translate('containsFormula')} />}
      {audioAssetId && (
        <AudioLines className="size-3 shrink-0" aria-label={translate('containsAudio')} />
      )}
    </div>
  )
}
