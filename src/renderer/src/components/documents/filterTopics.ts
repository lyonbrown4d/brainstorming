import { create } from 'zustand'
import type { MindMapDocument, Topic } from '@core'

export interface TopicFilters {
  label: string
  marker: string
  task: 'all' | 'open' | 'done' | 'overdue'
  priority: 'all' | '1' | '2' | '3'
  assignee: string
}
export const defaultTopicFilters: TopicFilters = {
  label: '',
  marker: '',
  task: 'all',
  priority: 'all',
  assignee: '',
}
export const useTopicFilters = create<TopicFilters>(() => ({ ...defaultTopicFilters }))
function localDate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function filterTopics(
  document: MindMapDocument,
  filters: TopicFilters,
  today = localDate(),
): Topic[] {
  return Object.values(document.topics).filter((topic) => {
    const metadata = topic.metadata,
      task = metadata?.task
    if (filters.label && !metadata?.labels?.includes(filters.label)) return false
    if (filters.marker && !metadata?.markers?.includes(filters.marker)) return false
    if (filters.priority !== 'all' && task?.priority !== Number(filters.priority)) return false
    if (
      filters.assignee &&
      !task?.assignee?.toLocaleLowerCase().includes(filters.assignee.toLocaleLowerCase())
    )
      return false
    if (filters.task === 'open' && (!task || task.done)) return false
    if (filters.task === 'done' && !task?.done) return false
    if (filters.task === 'overdue' && (!task || task.done || !task.due || task.due >= today))
      return false
    return true
  })
}
