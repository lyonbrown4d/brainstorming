import { expect, it } from 'vitest'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { DragSession } from '@renderer/lib/canvasGestureSession'
import { canvasDragPreview, previewCanvasDrag } from '@renderer/lib/canvasDragPreview'

it('applies one 2D displacement to the selected subtree and preserves unchanged node identities', () => {
  const nodes = [
    { id: 'anchor', position: { x: 100, y: 40 } },
    { id: 'child', position: { x: 20, y: 20 } },
    { id: 'unrelated', position: { x: 50, y: 50 } },
  ] as CanvasFlowNode[]
  const session = {
    excluded: new Set(['anchor', 'child']),
    origins: new Map([
      ['anchor', { x: 0, y: 0 }],
      ['child', { x: 20, y: 20 }],
    ]),
  }
  const moved = previewCanvasDrag(nodes, session, 100, 40)
  expect(moved[0]).toBe(nodes[0])
  expect(moved[1]?.position).toEqual({ x: 120, y: 60 })
  expect(moved[2]).toBe(nodes[2])
  expect(previewCanvasDrag(moved, session, 100, 40)).toBe(moved)
})

it('uses the newest anchor position and ignores changes without an active gesture anchor', () => {
  const session = {
    anchorId: 'anchor',
    excluded: new Set(['anchor', 'child']),
    origins: new Map([
      ['anchor', { x: 10, y: 20 }],
      ['child', { x: 50, y: 80 }],
    ]),
  } as DragSession
  const preview = canvasDragPreview(
    [{ type: 'position', id: 'anchor', position: { x: 40, y: 10 } }],
    session,
  )
  const nodes = [{ id: 'child', position: { x: 50, y: 80 } }] as CanvasFlowNode[]
  expect(preview?.(nodes)[0]?.position).toEqual({ x: 80, y: 70 })
  expect(canvasDragPreview([], session)).toBeUndefined()
  expect(canvasDragPreview([], null)).toBeUndefined()
})
