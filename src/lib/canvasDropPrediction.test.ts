import { expect, it } from 'vitest'
import { applyCommand, createDocument, createHistory, executeCommand, undo } from '@core'
import { canvasDropCommand } from '@renderer/lib/canvasDrop'
import { createCanvasDropFinder } from '@renderer/lib/canvasDropIndex'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'

const fixture = () => {
  const document = applyCommand(createDocument('归属预判'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'target', title: '目标' },
      { type: 'addTopic', parentId: 'root', id: 'moving', title: '移动主题' },
      { type: 'addTopic', parentId: 'moving', id: 'child', title: '后代' },
    ],
  })
  const positions = {
    root: [-400, 0],
    target: [0, 0],
    moving: [500, 300],
    child: [700, 300],
  } as const
  const nodes = projectCanvas(document).nodes.map((node) => ({
    ...node,
    position: {
      x: positions[node.id as keyof typeof positions][0],
      y: positions[node.id as keyof typeof positions][1],
    },
    style: { width: 100, height: 40 },
    zIndex: 0,
  }))
  return { document, nodes, excluded: new Set(['moving', 'child']) }
}

it('previews a child before contact using the visible rectangle, then commits once and undoes', () => {
  const { document, nodes, excluded } = fixture()
  const before = JSON.stringify(document)
  const find = createCanvasDropFinder(document, nodes, excluded, 48)
  // Cursor remains far from the target because the topic was grabbed at its right edge.
  const drop = find({ x: 215, y: 20 }, { x: 120, y: 0, width: 100, height: 40 })
  expect(drop).toMatchObject({ targetId: 'target', parentId: 'target', predicted: true })
  expect(JSON.stringify(document)).toBe(before)
  const command = canvasDropCommand(document, ['moving'], new Map(), { x: 0, y: 0 }, drop)
  if (!command) throw new Error('Missing predicted drop command')
  const history = executeCommand(createHistory(document), command)
  expect(history.document.topics.target?.children).toEqual(['moving'])
  expect(history.document.topics.moving?.children).toEqual(['child'])
  expect(history.past).toHaveLength(1)
  expect(undo(history).document).toEqual(document)
})

it('predicts sibling insertion before contact using the remaining child order', () => {
  const { document, nodes } = fixture()
  const find = createCanvasDropFinder(document, nodes, new Set(['child']), 48)
  expect(find({ x: 50, y: -60 }, { x: 0, y: -80, width: 100, height: 40 })).toMatchObject({
    targetId: 'target',
    parentId: 'root',
    index: 0,
    predicted: true,
    indicator: { axis: 'y', edge: 'before' },
  })
})

it('leaves an attached branch freely placed near its existing parent without a no-op snap', () => {
  const { document, nodes, excluded } = fixture()
  const find = createCanvasDropFinder(document, nodes, excluded, 48)
  expect(find({ x: -180, y: 20 }, { x: -280, y: 0, width: 100, height: 40 })).toBeUndefined()
  // Explicitly entering the parent body still allows restoring its automatic layout.
  expect(find({ x: -350, y: 20 })?.parentId).toBe('root')
})

it('holds a nearby candidate across a small exit band, releases it farther away and resets on an exact hit', () => {
  const { document, nodes, excluded } = fixture()
  const find = createCanvasDropFinder(document, nodes, excluded, 48)
  const at = (gap: number) =>
    find({ x: 150 + gap, y: 20 }, { x: 100 + gap, y: 0, width: 100, height: 40 })
  expect(at(45)?.predicted).toBe(true)
  expect(at(54)?.parentId).toBe('target')
  expect(at(70)).toBeUndefined()
  expect(at(54)).toBeUndefined()
  expect(at(45)?.predicted).toBe(true)
  expect(find({ x: -350, y: 20 })?.parentId).toBe('root')
  expect(at(54)).toBeUndefined()
})

it.each([0.25, 1, 2])('keeps the magnetic reach at 48 screen pixels at zoom %s', (zoom) => {
  const { document, nodes, excluded } = fixture()
  const find = createCanvasDropFinder(document, nodes, excluded, 48 / zoom)
  expect(
    find({ x: 150 + 40 / zoom, y: 20 }, { x: 100 + 40 / zoom, y: 0, width: 100, height: 40 })
      ?.parentId,
  ).toBe('target')
  expect(
    find({ x: 150 + 80 / zoom, y: 20 }, { x: 100 + 80 / zoom, y: 0, width: 100, height: 40 }),
  ).toBeUndefined()
})

it('uses the projected outgoing direction in 3D and gives frontmost topic bodies precedence', () => {
  const { document, nodes, excluded } = fixture()
  const rotated = nodes.map((node) =>
    node.id === 'root' ? { ...node, position: { x: 0, y: -300 } } : node,
  )
  const find = createCanvasDropFinder(document, rotated, excluded, 48)
  expect(find({ x: 50, y: 100 }, { x: 0, y: 70, width: 100, height: 40 })).toMatchObject({
    parentId: 'target',
    predicted: true,
  })
  const overlap = nodes.map((node) => ({
    ...node,
    position: { x: 0, y: 0 },
    zIndex: node.id === 'target' ? 10 : 0,
  }))
  expect(createCanvasDropFinder(document, overlap, excluded, 48)({ x: 50, y: 20 })?.parentId).toBe(
    'target',
  )
})

it('rejects excluded descendants, invalid geometry and points outside all prediction zones', () => {
  const { document, nodes, excluded } = fixture()
  const find = createCanvasDropFinder(document, nodes, excluded, 48)
  expect(find({ x: 750, y: 320 })).toBeUndefined()
  expect(find({ x: NaN, y: 0 })).toBeUndefined()
  expect(find({ x: 150, y: 20 }, { x: NaN, y: 0, width: 100, height: 40 })).toBeUndefined()
  expect(find({ x: 1e6, y: 1e6 })).toBeUndefined()
})
