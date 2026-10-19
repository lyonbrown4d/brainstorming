import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createExampleDocument,
  normalizeTopicSelection,
  createHistory,
  executeCommand,
  undo,
  redo,
  serializeDocument,
  deserializeDocument,
} from '@core'
import { getSubtreeIds } from '@core/tree'
import { canvasDropCommand, findCanvasDrop, nodeCenter } from '@renderer/lib/canvasDrop'
import { canvasDragPointer } from '@renderer/lib/canvasDragPointer'
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

  it.each(['map', 'org-down', 'matrix'] as const)(
    'keeps freely placed subtrees in %s without changing hierarchy, with persistence and one undo',
    (layout) => {
      const document = applyCommand(createExampleDocument(), {
        type: 'setDocumentSettings',
        settings: { layout },
      })
      const nodes = projectCanvas(document).nodes
      const origins = new Map(nodes.map((node) => [node.id, node.position]))
      const delta = { x: 180, y: -140 }
      const command = canvasDropCommand(document, ['vision'], origins, delta, undefined)
      if (!command) throw new Error('Missing free move')
      const moved = executeCommand(createHistory(document), command)
      const restored = deserializeDocument(serializeDocument(moved.document))
      const positions = projectCanvas(restored).nodes
      const subtree = getSubtreeIds(document, 'vision')
      for (const node of nodes) {
        const shift = subtree.includes(node.id) ? delta : { x: 0, y: 0 }
        expect(positions.find((entry) => entry.id === node.id)?.position).toEqual({
          x: node.position.x + shift.x,
          y: node.position.y + shift.y,
        })
        expect(restored.topics[node.id]?.children).toEqual(document.topics[node.id]?.children)
      }
      expect(moved.past).toHaveLength(1)
      expect(undo(moved).document).toEqual(document)
      expect(redo(undo(moved)).document).toEqual(moved.document)
      expect(
        canvasDropCommand(document, ['vision'], origins, { x: 0, y: 0 }, undefined),
      ).toBeUndefined()
    },
  )

  it('clears only the moved root offset on explicit attachment, preserving appearance and child placement', () => {
    const document = applyCommand(createExampleDocument(), {
      type: 'batch',
      commands: [
        {
          type: 'setTopicStyle',
          topicId: 'vision',
          style: { fill: '#abcdef', offsetX: 90, offsetY: -40 },
        },
        { type: 'setTopicStyle', topicId: 'vision-0', style: { offsetX: 15, offsetY: 10 } },
      ],
    })
    const nodes = projectCanvas(document).nodes
    const command = canvasDropCommand(
      document,
      ['vision'],
      new Map(nodes.map((node) => [node.id, node.position])),
      { x: 100, y: 20 },
      { targetId: 'users', parentId: 'users', side: 'left' },
    )
    if (!command) throw new Error('Missing reparent')
    const moved = executeCommand(createHistory(document), command)
    expect(moved.document.topics.users?.children).toContain('vision')
    expect(moved.document.topics.vision?.style).toEqual({ fill: '#abcdef' })
    expect(moved.document.topics['vision-0']?.style).toEqual({ offsetX: 15, offsetY: 10 })
    expect(moved.past).toHaveLength(1)
    expect(undo(moved).document).toBe(document)
  })

  it.each([1, 8, 20])('does not attach a pointer %spx outside the topic body', (gap) => {
    const { document, nodes } = fixture()
    const target = nodes.find((node) => node.id === 'vision')
    if (!target) throw new Error('Missing target')
    const center = nodeCenter(target)
    expect(
      findCanvasDrop(document, [target], new Set(), {
        x: target.position.x + Number(target.style?.width) + gap,
        y: center.y,
      }),
    ).toBeUndefined()
  })
})

describe('drag pointer coordinates', () => {
  it('keeps the mouse grab point and touch release coordinates instead of a node center', () => {
    expect(canvasDragPointer({ clientX: 73, clientY: 104 })).toEqual({ x: 73, y: 104 })
    expect(
      canvasDragPointer({
        touches: [{ clientX: 91, clientY: 133 }],
        changedTouches: [{ clientX: 12, clientY: 16 }],
      }),
    ).toEqual({ x: 91, y: 133 })
    expect(
      canvasDragPointer({ touches: [], changedTouches: [{ clientX: 98, clientY: 141 }] }),
    ).toEqual({ x: 98, y: 141 })
    expect(canvasDragPointer({ touches: [], changedTouches: [] })).toBeUndefined()
  })
})
