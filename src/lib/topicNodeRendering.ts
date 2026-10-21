import type { NodeProps } from '@xyflow/react'
import type { TopicFlowNode } from '@renderer/components/TopicNode'

const contentKeys = [
  'topic',
  'visualStyle',
  'root',
  'branch',
  'fill',
  'color',
  'textColor',
  'fontFamily',
  'direction',
  'worldWidth',
  'worldHeight',
] as const satisfies readonly (keyof TopicFlowNode['data'])[]

/** Perspective dimensions belong to React Flow's wrapper, not to the topic editor. */
export const sameTopicNodeContent = (
  previous: NodeProps<TopicFlowNode>,
  next: NodeProps<TopicFlowNode>,
): boolean =>
  previous.id === next.id &&
  (previous.data.worldWidth !== undefined &&
  previous.data.worldHeight !== undefined &&
  next.data.worldWidth !== undefined &&
  next.data.worldHeight !== undefined
    ? true
    : previous.width === next.width && previous.height === next.height) &&
  contentKeys.every((key) => Object.is(previous.data[key], next.data[key]))
