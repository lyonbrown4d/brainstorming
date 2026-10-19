import type { TaskPriority } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'
import { usePresentation } from '@renderer/state/presentation'
import { PriorityBadge } from '@renderer/components/metadata/PriorityBadge'
import { PriorityPicker } from '@renderer/components/metadata/PriorityPicker'
import { setTopicPriorities } from '@renderer/components/metadata/priorityCommands'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'

export const PriorityMarkerAction = ({
  topicId,
  priority,
}: {
  topicId: string
  priority: TaskPriority
}) => {
  const { translate } = useMessages()
  const playing = usePresentation((state) => state.playing)
  if (playing) return <PriorityBadge priority={priority} className="size-5 shrink-0" />
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="pointer-events-auto size-6 shrink-0 rounded p-0"
          aria-label={translate('editPriority', { value0: priority })}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
          }}
          onDoubleClick={(event) => {
            event.stopPropagation()
          }}
        >
          <PriorityBadge priority={priority} className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="nodrag nopan w-56"
        aria-label={translate('choosePriority')}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <PriorityPicker
          value={priority}
          onChange={(value) => {
            setTopicPriorities([topicId], value)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
