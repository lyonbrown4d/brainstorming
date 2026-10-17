import { useState } from 'react'
import type { TopicMetadata, TopicTask } from '@core'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { setMetadataField } from '@renderer/components/metadata/commands'

export const TaskPanel = ({ topicId, metadata }: { topicId: string; metadata: TopicMetadata }) => {
  const document = useEditor((state) => state.history.document)
  const task = metadata.task
  const [done, setDone] = useState(task?.done ?? false)
  const [priority, setPriority] = useState(String(task?.priority ?? 'none'))
  const [progress, setProgress] = useState(String(task?.progress ?? 0))
  const [start, setStart] = useState(task?.start ?? '')
  const [due, setDue] = useState(task?.due ?? '')
  const [assignee, setAssignee] = useState(task?.assignee ?? '')
  const [dependencies, setDependencies] = useState<readonly string[]>(task?.dependencies ?? [])
  const [dependency, setDependency] = useState('')
  const save = (): void => {
    const value: TopicTask = {
      done,
      ...(priority === 'none' ? {} : { priority: Number(priority) as 1 | 2 | 3 }),
      progress: Number(progress),
      ...(start ? { start } : {}),
      ...(due ? { due } : {}),
      ...(assignee.trim() ? { assignee: assignee.trim() } : {}),
      ...(dependencies.length ? { dependencies } : {}),
    }
    setMetadataField(topicId, 'task', value)
  }
  return (
    <section className="space-y-3 border-t border-border py-4">
      <h3 className="text-sm font-medium">任务</h3>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={done}
          onClick={() => {
            setDone(!done)
            if (!done) setProgress('100')
          }}
        >
          {done ? '已完成' : '未完成'}
        </Button>
        <div className="grid gap-1.5 text-xs">
          优先级
          <FieldSelect
            label="任务优先级"
            value={priority}
            options={[
              { value: 'none', label: '无优先级' },
              { value: '1', label: '高' },
              { value: '2', label: '中' },
              { value: '3', label: '低' },
            ]}
            onChange={setPriority}
          />
        </div>
        <label htmlFor={`task-progress-${topicId}`} className="grid gap-1.5 text-xs">
          进度（%）
          <Input
            id={`task-progress-${topicId}`}
            aria-label="任务进度"
            type="number"
            min={0}
            max={100}
            step={1}
            value={progress}
            onChange={(event) => {
              setProgress(event.target.value)
            }}
          />
        </label>
        <label htmlFor={`task-start-${topicId}`} className="grid gap-1.5 text-xs">
          开始日期
          <Input
            id={`task-start-${topicId}`}
            aria-label="任务开始日期"
            type="date"
            value={start}
            onChange={(event) => {
              setStart(event.target.value)
            }}
          />
        </label>
        <label htmlFor={`task-due-${topicId}`} className="grid gap-1.5 text-xs">
          截止日期
          <Input
            id={`task-due-${topicId}`}
            aria-label="任务截止日期"
            type="date"
            min={start || undefined}
            value={due}
            onChange={(event) => {
              setDue(event.target.value)
            }}
          />
        </label>
        <label htmlFor={`task-assignee-${topicId}`} className="grid gap-1.5 text-xs">
          负责人
          <Input
            id={`task-assignee-${topicId}`}
            aria-label="任务负责人"
            maxLength={120}
            value={assignee}
            onChange={(event) => {
              setAssignee(event.target.value)
            }}
          />
        </label>
        <div className="grid gap-1.5 text-xs">
          <span>前置任务</span>
          <div className="flex gap-1">
            <FieldSelect
              label="前置任务"
              className="flex-1"
              value={dependency}
              options={Object.values(document.topics)
                .filter((topic) => topic.id !== topicId && !dependencies.includes(topic.id))
                .map((topic) => ({ value: topic.id, label: topic.title || '未命名主题' }))}
              onChange={setDependency}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!dependency}
              onClick={() => {
                setDependencies([...dependencies, dependency])
                setDependency('')
              }}
            >
              添加
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {dependencies.map((id) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant="secondary"
                className="max-w-full truncate"
                aria-label={`移除前置任务 ${document.topics[id]?.title ?? id}`}
                onClick={() => {
                  setDependencies(dependencies.filter((item) => item !== id))
                }}
              >
                {document.topics[id]?.title ?? id} ×
              </Button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" type="submit">
            保存任务
          </Button>
          {task && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setMetadataField(topicId, 'task', undefined)
              }}
            >
              移除任务
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}
