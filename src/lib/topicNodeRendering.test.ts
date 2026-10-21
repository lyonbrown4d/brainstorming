import { expect, it } from 'vitest'
import type { NodeProps } from '@xyflow/react'
import { createDocument } from '@core'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import { sameTopicNodeContent } from '@renderer/lib/topicNodeRendering'

const topic = createDocument('缓存内容').topics.root
if (!topic) throw new Error('Missing fixture root')
const props: NodeProps<TopicFlowNode> = {
  id: topic.id,
  type: 'topic',
  data: {
    topic,
    root: true,
    color: '#336699',
    worldWidth: 180,
    worldHeight: 60,
    cameraScale: 1.2,
    cameraDepth: 100,
  },
  width: 216,
  height: 72,
  selected: false,
  selectable: true,
  draggable: true,
  deletable: true,
  dragging: false,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  zIndex: 0,
}

it('keeps topic content cached while the camera changes projection, depth and frame', () => {
  expect(
    sameTopicNodeContent(props, {
      ...props,
      width: 360,
      height: 120,
      positionAbsoluteX: 200,
      data: {
        ...props.data,
        cameraScale: 2,
        cameraDepth: 75,
        cameraFrame: { mode: '3d', yaw: 0.7, pitch: 0.5, spacing: 100, cameraDistance: 800 },
      },
    }),
  ).toBe(true)
})

it('invalidates content for an edited title, changed appearance or canonical size', () => {
  for (const data of [
    { ...props.data, topic: { ...topic, title: '修改后的内容' } },
    { ...props.data, fill: '#ff8800' },
    { ...props.data, worldWidth: 220 },
    { ...props.data, worldHeight: 90 },
    { ...props.data, direction: 'left' as const },
  ])
    expect(sameTopicNodeContent(props, { ...props, data })).toBe(false)
})

it('still updates two-dimensional content and partial boxes when their dimensions change', () => {
  const data = { topic, root: true, color: '#336699' }
  const flat = { ...props, data }
  expect(sameTopicNodeContent(flat, { ...flat, width: 250 })).toBe(false)
  expect(sameTopicNodeContent(flat, { ...flat, height: 90 })).toBe(false)
  const partial = { ...flat, data: { ...data, worldWidth: 180 } }
  expect(sameTopicNodeContent(partial, { ...partial, height: 100 })).toBe(false)
})
