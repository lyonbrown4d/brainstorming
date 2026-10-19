import { PriorityPicker } from '@renderer/components/metadata/PriorityPicker'
import { setTopicPriorities } from '@renderer/components/metadata/priorityCommands'
import { useMessages } from '@renderer/i18n/useMessages'

import type { TopicTask } from '@core'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { setMetadataField } from '@renderer/components/metadata/commands'

export const TaskQuickControls = ({
  topicId,
  task,
}: {
  topicId: string
  task: TopicTask | undefined
}) => {
  const { translate } = useMessages()

  const update = (patch: Partial<TopicTask>): void => {
    const current = useEditor.getState().history.document.topics[topicId]?.metadata?.task ?? {
      done: false,
    }
    setMetadataField(topicId, 'task', { ...current, ...patch })
  }
  const busy = useEditor((state) => state.busy)
  const progress = task?.progress ?? 0
  const steps = [0, 25, 50, 75, 100]
  if (!steps.includes(progress)) steps.push(progress)
  return (
    <section className="space-y-2 border-b pb-3" aria-label={translate('taskMarkers')}>
      <PriorityPicker
        value={task?.priority}
        disabled={busy}
        onChange={(priority) => {
          setTopicPriorities([topicId], priority)
        }}
      />
      <div className="flex items-center gap-2">
        <span className="w-12 text-xs">{translate('progressLabel115')}</span>
        <FieldSelect
          label={translate('quickTaskProgress')}
          value={String(progress)}
          className="flex-1"
          options={steps
            .sort((a, b) => a - b)
            .map((value) => ({ value: String(value), label: `${value}%` }))}
          onChange={(value) => {
            update({ progress: Number(value), done: Number(value) === 100 })
          }}
        />
        <Button
          variant="outline"
          size="sm"
          aria-label={translate('taskCompleted')}
          aria-pressed={task?.done ?? false}
          onClick={() => {
            update({ done: !task?.done, progress: task?.done ? 0 : 100 })
          }}
        >
          {task?.done ? translate('completed') : translate('complete')}
        </Button>
      </div>
      {task && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-0 text-xs text-muted-foreground"
          onClick={() => {
            setMetadataField(topicId, 'task', undefined)
          }}
        >
          {translate('removeTaskMarkers')}
        </Button>
      )}
    </section>
  )
}
