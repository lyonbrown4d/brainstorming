import { expect, it } from 'vitest'
import { applyCommand, createDocument } from '@core'
import { layoutDocument } from '@layout'
import { defaultTopicFilters } from '@renderer/components/documents/filterTopics'
import { canvasTopicFilter, filterCanvasLayout } from '@renderer/lib/canvasTopicFilter'

const fixture = () =>
  applyCommand(createDocument('Filter', 'filter'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'a', title: 'Ancestor' },
      { type: 'addTopic', parentId: 'a', id: 'match', title: 'Match' },
      { type: 'addTopic', parentId: 'root', id: 'other', title: 'Other' },
      { type: 'setTopicMetadata', topicId: 'match', metadata: { labels: ['keep'] } },
      { type: 'toggleCollapse', topicId: 'a' },
    ],
  })

it('shows matches and ancestor paths through collapsed branches without changing saved content', () => {
  const document = fixture()
  const filtered = canvasTopicFilter(document, {
    ...defaultTopicFilters,
    canvasMode: 'branches',
    label: 'keep',
  })
  expect(filtered.visible).toEqual(new Set(['root', 'match', 'a']))
  expect(filtered.source.topics.a?.collapsed).toBe(false)
  expect(document.topics.a?.collapsed).toBe(true)
  const layout = filterCanvasLayout(layoutDocument(filtered.source), filtered.visible)
  expect(layout.nodes.map((node) => node.id).sort()).toEqual(['a', 'match', 'root'])
  expect(
    layout.edges.every(
      (edge) => filtered.visible?.has(edge.source) && filtered.visible.has(edge.target),
    ),
  ).toBe(true)
  expect(document.topics.other).toBeDefined()
})

it('keeps the root when no topic matches, and restores the original view when filters clear', () => {
  const document = fixture()
  const empty = canvasTopicFilter(document, {
    ...defaultTopicFilters,
    canvasMode: 'branches',
    label: 'missing',
  })
  expect(empty.matches?.size).toBe(0)
  expect(empty.visible).toEqual(new Set(['root']))
  expect(canvasTopicFilter(document, defaultTopicFilters).source).toBe(document)
  expect(canvasTopicFilter(document, { ...defaultTopicFilters, label: 'keep' }).visible).toBeNull()
})
