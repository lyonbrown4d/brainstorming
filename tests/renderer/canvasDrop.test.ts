import { describe, expect, it } from 'vitest'
import { applyCommand, createExampleDocument, normalizeTopicSelection } from '@core'
import { getSubtreeIds } from '@core/tree'
import { canvasDropCommand, findCanvasDrop, nodeCenter } from '@renderer/lib/canvasDrop'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'

const fixture = () => {
  const document = createExampleDocument()
  const nodes = projectCanvas(document).nodes
  const roots = normalizeTopicSelection(document, ['vision-0', 'vision-1'])
  const excluded = new Set(roots.flatMap((id) => getSubtreeIds(document, id)))
  const origins = new Map(nodes.map((node) => [node.id, node.position]))
  return { document, nodes, roots, excluded, origins }
}

describe('canvas group drop commands', () => {
  it('attaches the selected roots together without changing the document during preview', () => {
    const { document, nodes, roots, excluded, origins } = fixture()
    const target = nodes.find((node) => node.id === 'users')
    if (!target) throw new Error('Missing target')
    const before = JSON.stringify(document)
    const drop = findCanvasDrop(document, nodes, excluded, nodeCenter(target))
    expect(drop?.parentId).toBe('users')
    const command = canvasDropCommand(document, roots, origins, { x: 0, y: 0 }, drop)
    expect(JSON.stringify(document)).toBe(before)
    if (!command) throw new Error('Missing drop command')
    const moved = applyCommand(document, command)
    expect(moved.topics.users?.children.slice(-2)).toEqual(roots)
    for (const id of roots) expect(moved.topics.vision?.children).not.toContain(id)
  })

  it('normalizes ancestor selections and excludes every descendant from drop targets', () => {
    const { document, nodes } = fixture()
    const roots = normalizeTopicSelection(document, ['vision', 'vision-0'])
    expect(roots).toEqual(['vision'])
    const excluded = new Set(roots.flatMap((id) => getSubtreeIds(document, id)))
    for (const node of nodes.filter((item) => excluded.has(item.id)))
      expect(findCanvasDrop(document, nodes, excluded, nodeCenter(node))).toBeUndefined()
  })

  it('inserts before a sibling edge using an index after removing moving roots', () => {
    const { document, nodes, origins } = fixture()
    const roots = ['vision-1']
    const excluded = new Set(roots)
    const first = nodes.find((node) => node.id === 'vision-0')
    if (!first) throw new Error('Missing sibling')
    const center = nodeCenter(first)
    const before = findCanvasDrop(document, nodes, excluded, {
      x: center.x,
      y: first.position.y - 4,
    })
    expect(before).toMatchObject({ parentId: 'vision', index: 0 })
    const command = canvasDropCommand(document, roots, origins, { x: 0, y: 0 }, before)
    if (!command) throw new Error('Missing reorder command')
    expect(applyCommand(document, command).topics.vision?.children).toEqual([
      'vision-1',
      'vision-0',
    ])
  })

  it('translates several floating roots by one delta and attaches them when dropped on a branch', () => {
    const source = createExampleDocument()
    const document = applyCommand(source, {
      type: 'batch',
      commands: [
        { type: 'addFloatingTopic', id: 'floating-a', title: 'A', x: 1300, y: 150 },
        { type: 'addFloatingTopic', id: 'floating-b', title: 'B', x: 1450, y: 350 },
      ],
    })
    const nodes = projectCanvas(document).nodes
    const origins = new Map(nodes.map((node) => [node.id, node.position]))
    const roots = ['floating-a', 'floating-b']
    const command = canvasDropCommand(document, roots, origins, { x: 30, y: -70 }, undefined)
    expect(command?.type).toBe('batch')
    if (!command) throw new Error('Missing translation')
    const moved = applyCommand(document, command)
    expect(moved.floatingPositions).toMatchObject({
      'floating-a': { x: 1330, y: 80 },
      'floating-b': { x: 1480, y: 280 },
    })
    const attach = canvasDropCommand(
      document,
      roots,
      origins,
      { x: 0, y: 0 },
      {
        targetId: 'users',
        parentId: 'users',
        side: document.topics.users?.side ?? 'left',
      },
    )
    if (!attach) throw new Error('Missing attachment')
    const attached = applyCommand(document, attach)
    expect(attached.floatingIds).toEqual([])
    expect(attached.floatingPositions).toEqual({})
    expect(attached.topics.users?.children.slice(-2)).toEqual(roots)
  })

  it('leaves attached topics unchanged when dropped onto empty canvas', () => {
    const { document, roots, origins } = fixture()
    expect(
      canvasDropCommand(document, roots, origins, { x: 100, y: 100 }, undefined),
    ).toBeUndefined()
  })
})
