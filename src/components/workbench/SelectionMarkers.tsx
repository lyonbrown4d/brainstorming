import { PriorityPicker } from '@renderer/components/metadata/PriorityPicker'
import { setTopicPriorities } from '@renderer/components/metadata/priorityCommands'
import { useMessages } from '@renderer/i18n/useMessages'

import { ChevronDown, Smile } from 'lucide-react'
import type { Command, TopicMetadata } from '@core'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds } from '@renderer/state/selection'
import { MarkerPicker } from '@renderer/components/metadata/MarkerPicker'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
const toggleSelectedMarker = (marker: string): void => {
  const state = useEditor.getState()
  if (state.busy || marker.length > 64) return
  state.commitDraft()
  const current = useEditor.getState()
  if (current.editingId) return
  const topics = selectedTopicIds(current).flatMap((id) => {
    const topic = current.history.document.topics[id]
    return topic ? [topic] : []
  })
  const remove = topics.every((topic) => topic.metadata?.markers?.includes(marker))
  if (
    !remove &&
    topics.some(
      (topic) =>
        (topic.metadata?.markers?.length ?? 0) >= 32 && !topic.metadata?.markers?.includes(marker),
    )
  )
    return
  const commands: Command[] = topics.map((topic) => {
    const markers = topic.metadata?.markers ?? []
    return {
      type: 'setTopicMetadata',
      topicId: topic.id,
      metadata: {
        ...topic.metadata,
        markers: remove
          ? markers.filter((value) => value !== marker)
          : [...new Set([...markers, marker])],
      },
    }
  })
  if (commands.length) current.command({ type: 'batch', commands })
}
export const SelectionMarkers = ({ ids }: { ids: readonly string[] }) => {
  const { translate } = useMessages()

  const document = useEditor((state) => state.history.document)
  const busy = useEditor((state) => state.busy)
  const first = document.topics[ids[0] ?? '']?.metadata?.markers ?? []
  const priority = document.topics[ids[0] ?? '']?.metadata?.task?.priority
  const mixedPriority = ids.some((id) => document.topics[id]?.metadata?.task?.priority !== priority)
  const shared = first.filter((marker) =>
    ids.every((id) => document.topics[id]?.metadata?.markers?.includes(marker)),
  )
  return (
    <section
      className="space-y-3 border-t border-border py-4"
      aria-label={translate('topicMarkers')}
    >
      <h3 className="text-sm font-medium">{translate('markers')}</h3>
      <PriorityPicker
        value={mixedPriority ? undefined : priority}
        mixed={mixedPriority}
        disabled={busy}
        onChange={(value) => {
          setTopicPriorities(ids, value)
        }}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-start gap-2 text-sm font-normal"
            disabled={busy}
          >
            <Smile className="size-4 text-muted-foreground" />
            {shared.length
              ? translate('value0SharedMarkers', { value0: shared.length })
              : translate('addMarker')}
            <ChevronDown className="ml-auto size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="start"
          className="w-80"
          aria-label={translate('selectedTopicMarkers')}
        >
          {ids.length > 1 && (
            <p className="mb-3 text-xs text-muted-foreground">
              {translate('iconsApplyToAll')}
              {ids.length}
              {translate('topicsClickASharedIconAgainTo')}
            </p>
          )}
          <MarkerPicker
            selected={shared}
            onToggle={toggleSelectedMarker}
            style={document.topics[ids[0] ?? '']?.metadata?.markerStyle}
            onStyleChange={(style) => {
              setSelectedMarkerStyle(style)
            }}
          />
        </PopoverContent>
      </Popover>
    </section>
  )
}
const setSelectedMarkerStyle = (style: NonNullable<TopicMetadata['markerStyle']>): void => {
  const state = useEditor.getState()
  if (state.busy) return
  state.commitDraft()
  const current = useEditor.getState()
  if (current.editingId) return
  const commands: Command[] = selectedTopicIds(current).flatMap((topicId) => {
    const topic = current.history.document.topics[topicId]
    return topic
      ? [
          {
            type: 'setTopicMetadata' as const,
            topicId,
            metadata: { ...topic.metadata, markerStyle: style },
          },
        ]
      : []
  })
  if (commands.length) current.command({ type: 'batch', commands })
}
