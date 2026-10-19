import type { Command, TaskPriority } from '@core'
import { useEditor } from '@renderer/state/editor'

/** Assigns or clears one exclusive priority, preserving every other metadata field. */
export const setTopicPriorities = (
  ids: readonly string[],
  priority: TaskPriority | undefined,
): boolean => {
  const editor = useEditor.getState()
  if (editor.busy) return false
  editor.commitDraft()
  const state = useEditor.getState()
  if (state.editingId) return false
  const commands: Command[] = [...new Set(ids)].flatMap((topicId) => {
    const topic = state.history.document.topics[topicId]
    if (!topic || topic.metadata?.task?.priority === priority) return []
    const metadata = { ...topic.metadata }
    const task = { ...metadata.task }
    if (priority === undefined) delete task.priority
    else task.priority = priority
    if (Object.keys(task).length) metadata.task = task
    else delete metadata.task
    return [{ type: 'setTopicMetadata', topicId, metadata }]
  })
  return commands.length > 0 && state.command({ type: 'batch', commands })
}
