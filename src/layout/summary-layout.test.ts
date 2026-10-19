import { describe, expect, it } from 'vitest'
import { applyCommand, createDocument } from '@core'
import { layoutDocument } from '@layout'
import type { LayoutNode } from '@layout'

const requireNode = (nodes: readonly LayoutNode[], id: string): LayoutNode => {
  const node = nodes.find((item) => item.id === id)
  if (!node) throw new Error(`Test layout node ${id} missing`)
  return node
}

const fixture = () =>
  applyCommand(createDocument('Map', 'layout-summary'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'a', title: 'A', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'b', title: 'B', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'summary', title: 'Summary', side: 'right' },
      { type: 'addTopic', parentId: 'summary', id: 'detail', title: 'Detail' },
      {
        type: 'upsertGroup',
        group: { id: 'group', kind: 'summary', topicIds: ['a', 'b'], summaryTopicId: 'summary' },
      },
    ],
  })

describe('summary topic layout', () => {
  it('projects the whole editable subtree beside the source range', () => {
    const document = fixture()
    const layout = layoutDocument(document)
    const summary = requireNode(layout.nodes, 'summary')
    const detail = requireNode(layout.nodes, 'detail')
    const sources = [requireNode(layout.nodes, 'a'), requireNode(layout.nodes, 'b')]
    expect(summary.x).toBeGreaterThan(Math.max(...sources.map((node) => node.x + node.width)))
    expect(detail.x).toBeGreaterThan(summary.x)
    expect(
      layout.edges.some(({ source, target }) => source === 'root' && target === 'summary'),
    ).toBe(false)
    expect(
      layout.edges.some(({ source, target }) => source === 'summary' && target === 'detail'),
    ).toBe(true)
  })

  it('hides a linked subtree when all source topics are hidden and honors manual offset', () => {
    const base = fixture()
    const offset = applyCommand(base, {
      type: 'setTopicStyle',
      topicId: 'summary',
      style: { offsetX: 45, offsetY: -20 },
    })
    const before = requireNode(layoutDocument(base).nodes, 'summary')
    const after = requireNode(layoutDocument(offset).nodes, 'summary')
    expect(after.x - before.x).toBe(45)
    expect(after.y - before.y).toBe(-20)
    const collapsed = applyCommand(base, { type: 'toggleCollapse', topicId: 'root' })
    expect(layoutDocument(collapsed).nodes.map(({ id }) => id)).toEqual(['root'])
  })

  it('positions nested summaries after their enclosing subtree regardless of group order', () => {
    const base = applyCommand(fixture(), {
      type: 'batch',
      commands: [
        { type: 'addTopic', parentId: 'summary', id: 'detail-2', title: 'More' },
        { type: 'addTopic', parentId: 'summary', id: 'nested', title: 'Nested' },
        {
          type: 'upsertGroup',
          group: {
            id: 'nested-group',
            kind: 'summary',
            topicIds: ['detail', 'detail-2'],
            summaryTopicId: 'nested',
          },
        },
      ],
    })
    const reversed = { ...base, groups: [...(base.groups ?? [])].reverse() }
    const layout = layoutDocument(reversed)
    const summary = requireNode(layout.nodes, 'summary')
    const detail = requireNode(layout.nodes, 'detail')
    const nested = requireNode(layout.nodes, 'nested')
    expect(detail.x).toBeGreaterThan(summary.x)
    expect(nested.x).toBeGreaterThan(detail.x + detail.width)
    expect(new Set(layout.nodes.map(({ id }) => id)).size).toBe(layout.nodes.length)
  })
})
