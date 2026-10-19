import { Check, X } from 'lucide-react'
import { TASK_PRIORITIES, type TaskPriority } from '@core'
import { isTaskPriority } from '@shared/taskPriority'
import { useMessages } from '@renderer/i18n/useMessages'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { Button } from '@renderer/components/ui/button'
import { PriorityBadge } from '@renderer/components/metadata/PriorityBadge'

export const PriorityPicker = ({
  value,
  mixed = false,
  disabled = false,
  onChange,
}: {
  value: TaskPriority | undefined
  mixed?: boolean
  disabled?: boolean
  onChange: (priority: TaskPriority | undefined) => void
}) => {
  const { translate } = useMessages()
  return (
    <div className="space-y-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-xs font-medium">{translate('priority')}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1 text-xs text-muted-foreground"
          disabled={disabled || (!value && !mixed)}
          onClick={() => {
            onChange(undefined)
          }}
        >
          <X className="size-3" />
          {translate('clearPriority')}
        </Button>
      </div>
      <ToggleGroup
        type="single"
        value={value ? String(value) : ''}
        disabled={disabled}
        spacing={1}
        className="grid w-full grid-cols-3 gap-1"
        aria-label={translate('choosePriority')}
        onValueChange={(next) => {
          const priority = Number(next)
          onChange(isTaskPriority(priority) ? priority : undefined)
        }}
      >
        {TASK_PRIORITIES.map((priority) => (
          <ToggleGroupItem
            key={priority}
            type="button"
            value={String(priority)}
            aria-label={translate('priorityValue0Label755', { value0: priority })}
            title={translate('priorityValue0Label755', { value0: priority })}
            className="relative h-11 rounded-md border border-transparent px-2 data-[state=on]:border-foreground data-[state=on]:bg-accent"
          >
            <PriorityBadge priority={priority} />
            {value === priority && <Check className="absolute top-1 right-1 size-3" />}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {mixed && <p className="text-xs text-muted-foreground">{translate('mixedPriorities')}</p>}
    </div>
  )
}
