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
  const update = (patch: Partial<TopicTask>): void => {
    const current = useEditor.getState().history.document.topics[topicId]?.metadata?.task ?? {
      done: false,
    }
    setMetadataField(topicId, 'task', { ...current, ...patch })
  }
  const setPriority = (priority: 1 | 2 | 3): void => {
    const current = useEditor.getState().history.document.topics[topicId]?.metadata?.task ?? {
      done: false,
    }
    const next = { ...current }
    if (current.priority === priority) delete next.priority
    else next.priority = priority
    setMetadataField(topicId, 'task', next)
  }
  const progress = task?.progress ?? 0
  const steps = [0, 25, 50, 75, 100]
  if (!steps.includes(progress)) steps.push(progress)
  return (
    <section className="space-y-2 border-b pb-3" aria-label="任务标记">
      <div className="flex items-center gap-2">
        <span className="w-12 text-xs">优先级</span>
        <div className="flex gap-1" role="group" aria-label="快捷优先级">
          {([1, 2, 3] as const).map((priority) => (
            <Button
              key={priority}
              variant="outline"
              size="sm"
              aria-label={`优先级 ${priority}`}
              aria-pressed={task?.priority === priority}
              className="h-8 px-2 aria-pressed:border-primary aria-pressed:bg-accent"
              onClick={() => {
                setPriority(priority)
              }}
            >
              P{priority}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-xs">进度</span>
        <FieldSelect
          label="快捷任务进度"
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
          aria-label="任务已完成"
          aria-pressed={task?.done ?? false}
          onClick={() => {
            update({ done: !task?.done, progress: task?.done ? 0 : 100 })
          }}
        >
          {task?.done ? '已完成' : '完成'}
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
          移除任务标记
        </Button>
      )}
    </section>
  )
}
