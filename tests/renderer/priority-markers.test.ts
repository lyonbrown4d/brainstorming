import { beforeEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument, TASK_PRIORITIES, validateTopicMetadata } from '@core'
import { DOMParser } from '@xmldom/xmldom'
import { hasTaskDetails, PRIORITY_COLORS } from '@shared/taskPriority'
import { useEditor } from '@renderer/state/editor'
import { setTopicPriorities } from '@renderer/components/metadata/priorityCommands'
import { setMetadataField } from '@renderer/components/metadata/commands'
import { defaultTopicFilters, filterTopics } from '@renderer/components/documents/filterTopics'
import { renderSheetSvg } from '@renderer/export/svg'
import { measureTopic } from '@layout'

beforeEach(() => {
  useEditor.getState().replace(
    applyCommand(createDocument('优先级'), {
      type: 'addTopic',
      parentId: 'root',
      id: 'child',
      title: '主题',
      side: 'right',
    }),
  )
  useEditor.setState({ busy: false })
})

describe('priority markers', () => {
  it('validates 1–9 and priority-only metadata while rejecting values outside the contract', () => {
    for (const priority of TASK_PRIORITIES)
      expect(() => {
        validateTopicMetadata({ task: { priority } })
      }).not.toThrow()
    for (const priority of [0, 10, 1.5, '9'])
      expect(() => {
        validateTopicMetadata({ task: { priority } })
      }).toThrow()
    expect(() => {
      validateTopicMetadata({ task: { priority: 9, done: 'false' } })
    }).toThrow()
    expect(() => {
      validateTopicMetadata({ task: { done: false, priority: 3 } })
    }).not.toThrow()
  })
  it('assigns one exclusive priority to multiple topics and restores all metadata with one undo', () => {
    setMetadataField('child', 'task', { done: false, priority: 2, progress: 25, assignee: 'Ada' })
    setMetadataField('root', 'labels', ['计划'])
    const before = useEditor.getState().history.document
    expect(setTopicPriorities(['root', 'child'], 9)).toBe(true)
    const after = useEditor.getState().history.document
    expect(after.topics.root?.metadata).toEqual({ labels: ['计划'], task: { priority: 9 } })
    expect(after.topics.child?.metadata?.task).toEqual({
      done: false,
      priority: 9,
      progress: 25,
      assignee: 'Ada',
    })
    useEditor.getState().undo()
    expect(useEditor.getState().history.document).toEqual(before)
    useEditor.getState().redo()
    expect(useEditor.getState().history.document).toEqual(after)
    const historyLength = useEditor.getState().history.past.length
    expect(setTopicPriorities(['root', 'child'], 9)).toBe(false)
    expect(useEditor.getState().history.past).toHaveLength(historyLength)
  })
  it('clears a priority without leaving a task, progress or badge height, and respects busy state', () => {
    const before = useEditor.getState().history.document.topics.root
    setTopicPriorities(['root'], 9)
    const marked = useEditor.getState().history.document
    expect(marked.topics.root?.metadata?.task).toEqual({ priority: 9 })
    expect(hasTaskDetails(marked.topics.root?.metadata?.task)).toBe(false)
    expect(
      filterTopics(marked, { ...defaultTopicFilters, priority: '9' }).map((topic) => topic.id),
    ).toEqual(['root'])
    expect(filterTopics(marked, { ...defaultTopicFilters, task: 'open' })).toEqual([])
    useEditor.setState({ busy: true })
    expect(setTopicPriorities(['root'], undefined)).toBe(false)
    useEditor.setState({ busy: false })
    expect(setTopicPriorities(['root'], undefined)).toBe(true)
    const root = useEditor.getState().history.document.topics.root
    expect(root?.metadata?.task).toBeUndefined()
    expect(measureTopic(root?.title ?? '', true, undefined, root).height).toBe(
      measureTopic(before?.title ?? '', true, undefined, before).height,
    )
  })
  it('exports the same numbered color badge without inventing incomplete status or progress', () => {
    setTopicPriorities(['root'], 9)
    const document = useEditor.getState().history.document
    const svg = new DOMParser().parseFromString(renderSheetSvg(document).svg, 'image/svg+xml')
    const badge = Array.from(svg.getElementsByTagName('svg')).find((node) =>
      node.hasAttribute('data-priority'),
    )
    expect(badge?.getAttribute('data-priority')).toBe('9')
    expect(badge?.getElementsByTagName('path')[0]?.getAttribute('fill')).toBe(PRIORITY_COLORS[9])
    expect(badge?.getElementsByTagName('text')[0]?.textContent).toBe('9')
    expect(svg.documentElement?.textContent).not.toContain('○')
    expect(svg.documentElement?.textContent).not.toContain('0%')
    expect(document.assets).toBeUndefined()
  })
})
