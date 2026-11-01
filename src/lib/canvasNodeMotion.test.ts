import { expect, it } from 'vitest'
import { applyCommand, createDocument } from '@core'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import { canvasNodeMotionPlan, CANVAS_MOTION_LIMIT } from '@renderer/lib/canvasNodeMotion'

const document = applyCommand(createDocument('Motion', 'motion-test'), {
  type: 'addTopic',
  parentId: 'root',
  id: 'child',
  title: 'Child',
})
const topic = (id: string, x = 0): TopicFlowNode => ({
  id,
  type: 'topic',
  position: { x, y: 0 },
  data: {
    topic: { id, title: 'Child', children: [], collapsed: false, side: 'right' },
    root: false,
    color: '#345678',
  },
})

it('identifies local geometry, entrance, exit and style changes without animating text input', () => {
  const unchanged = topic('stable')
  const changed = topic('style')
  const restyled: CanvasFlowNode = {
    ...changed,
    data: { ...changed.data, color: '#876543' },
  }
  const text = topic('text')
  const edited: CanvasFlowNode = {
    ...text,
    data: { ...text.data, topic: { ...text.data.topic, title: 'Typing' } },
  }
  const plan = canvasNodeMotionPlan(
    [unchanged, topic('move'), topic('exit'), changed, text],
    [unchanged, topic('move', 80), topic('enter'), restyled, edited],
  )
  expect([...plan.keys()]).toEqual(['move', 'enter', 'style', 'exit'])
  expect(plan.get('move')?.from.position.x).toBe(0)
  expect(plan.get('move')?.to.position.x).toBe(80)
  expect(plan.get('enter')?.entering).toBe(true)
  expect(plan.get('exit')?.leaving).toBe(true)
  expect(plan.get('style')?.appearance).toBe(true)
  expect(document.topics.child?.title).toBe('Child')
})

it('bounds the whole operation, including disappearing topics, rather than animating a partial tree', () => {
  const nodes = Array.from({ length: CANVAS_MOTION_LIMIT + 1 }, (_, index) => topic(String(index)))
  expect(canvasNodeMotionPlan([], nodes).size).toBe(0)
  expect(canvasNodeMotionPlan(nodes, []).size).toBe(0)
  expect(
    canvasNodeMotionPlan(
      nodes,
      nodes.map((node) => ({ ...node, position: { x: 80, y: 0 } })),
    ).size,
  ).toBe(0)
  expect(canvasNodeMotionPlan([], nodes.slice(1)).size).toBe(CANVAS_MOTION_LIMIT)
})
