import { TASK_PRIORITIES, type TaskPriority, type TopicTask } from '@core'

/** Original geometric priority badge, shared by the canvas and vector exports. */
export const PRIORITY_BADGE_PATH = 'M6 2h12l4 4v12l-4 4H6l-4-4V6z'
export const PRIORITY_COLORS: Readonly<Record<TaskPriority, string>> = {
  1: '#B42318',
  2: '#B54708',
  3: '#805B00',
  4: '#32723E',
  5: '#00766A',
  6: '#006C85',
  7: '#275DAD',
  8: '#6F42A8',
  9: '#59636D',
}
export const isTaskPriority = (value: unknown): value is TaskPriority =>
  TASK_PRIORITIES.some((priority) => priority === value)

/** A priority alone does not create an incomplete task or implicit progress. */
export const hasTaskDetails = (task: TopicTask | undefined): boolean =>
  Boolean(task && Object.keys(task).some((key) => key !== 'priority'))
