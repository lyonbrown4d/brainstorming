import { expect, it, vi } from 'vitest'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { createCanvasNodeMotion } from '@renderer/lib/canvasNodeMotion'

const driver = vi.hoisted(() => ({
  callbacks: null as null | { onUpdate: (progress: number) => void; onComplete: () => void },
  stop: vi.fn(),
}))
vi.mock('motion', () => ({
  animate: (_from: number, _to: number, callbacks: NonNullable<typeof driver.callbacks>) => {
    driver.callbacks = callbacks
    return { stop: driver.stop }
  },
}))
const node = (id: string, x = 0, title = id): TopicFlowNode => ({
  id,
  type: 'topic',
  position: { x, y: 0 },
  selected: true,
  data: {
    topic: { id, title, children: [], collapsed: false, side: 'right' },
    root: false,
    color: '#345678',
  },
})

it('publishes new content immediately and preserves selection changes while geometry settles', () => {
  const initial = node('moving')
  let nodes: CanvasFlowNode[] = [initial, node('text')]
  const motion = createCanvasNodeMotion(
    () => nodes,
    (next) => {
      nodes = next
    },
  )
  motion.publish([node('moving', 100, 'Updated'), node('text', 0, 'Typed')], true)
  expect(nodes[0]?.data).toMatchObject({ topic: { title: 'Updated' } })
  expect(nodes[1]?.data).toMatchObject({ topic: { title: 'Typed' } })
  expect(nodes[0]?.position.x).toBe(0)
  nodes = nodes.map((item) => ({ ...item, measured: { width: 160, height: 48 } }))
  driver.callbacks?.onUpdate(0.5)
  expect(nodes[0]?.position.x).toBe(50)
  nodes = nodes.map((item) => ({ ...item, selected: false }))
  driver.callbacks?.onComplete()
  expect(nodes[0]?.position.x).toBe(100)
  expect(nodes[0]?.selected).toBe(false)
  expect(nodes[0]?.style?.opacity).toBeUndefined()
  expect(nodes[0]?.measured).toEqual({ width: 160, height: 48 })
  expect(initial.position.x).toBe(0)
})

it('retargets from the current position and yields immediately to another direct interaction', () => {
  let nodes: CanvasFlowNode[] = [node('moving')]
  const motion = createCanvasNodeMotion(
    () => nodes,
    (next) => {
      nodes = next
    },
  )
  motion.publish([node('moving', 100)], true)
  driver.callbacks?.onUpdate(0.5)
  motion.publish([node('moving', 200)], true)
  expect(nodes[0]?.position.x).toBe(50)
  driver.callbacks?.onUpdate(0.5)
  expect(nodes[0]?.position.x).toBe(125)
  motion.finish()
  expect(nodes[0]?.position.x).toBe(200)
  expect(nodes[0]?.style?.opacity).toBeUndefined()
  expect(driver.stop).toHaveBeenCalled()
})

it('makes disappearing topics inert and clears them on interruption or a document switch', () => {
  let nodes: CanvasFlowNode[] = [node('removed'), node('retained')]
  const motion = createCanvasNodeMotion(
    () => nodes,
    (next) => {
      nodes = next
    },
  )
  motion.publish([node('retained')], true)
  const ghost = nodes.find((item) => item.id === 'removed')
  expect(ghost).toMatchObject({
    selected: false,
    draggable: false,
    selectable: false,
    focusable: false,
    domAttributes: { inert: true, 'aria-hidden': true },
    style: { pointerEvents: 'none' },
  })
  motion.publish([node('another-document')], false)
  expect(nodes.map((item) => item.id)).toEqual(['another-document'])
  expect(nodes[0]?.style?.opacity).toBeUndefined()
  motion.finish()
  expect(nodes.map((item) => item.id)).toEqual(['another-document'])
})
