import type { Relation, TopicGroup, TopicCallout, FloatingPosition } from '@core/extensions'
import * as v from '@core/extension-validation'
import { assertId } from '@core/validation'

export const validateRelation: (value: unknown) => asserts value is Relation = (
  value: unknown,
): asserts value is Relation => {
  const relation = v.record(value, [
    'id',
    'from',
    'to',
    'title',
    'color',
    'width',
    'dashed',
    'arrow',
  ])
  assertId(relation.id)
  assertId(relation.from)
  assertId(relation.to)
  if (relation.from === relation.to) throw new Error('关联线须连接两个不同主题')
  v.optional(relation, 'title', (entry) => {
    v.text(entry, 1000, true)
  })
  v.optional(relation, 'color', v.color)
  v.optional(relation, 'width', (entry) => {
    v.number(entry, 1, 6)
  })
  v.optional(relation, 'dashed', v.boolean)
  v.optional(relation, 'arrow', (entry) => {
    v.oneOf(entry, ['none', 'end', 'both'])
  })
}
export const validateTopicGroup: (value: unknown) => asserts value is TopicGroup = (
  value: unknown,
): asserts value is TopicGroup => {
  const group = v.record(value, ['id', 'topicIds', 'title', 'kind', 'color'])
  assertId(group.id)
  v.ids(group.topicIds, 512, 1)
  v.oneOf(group.kind, ['boundary', 'summary'])
  v.optional(group, 'title', (entry) => {
    v.text(entry, 1000, true)
  })
  v.optional(group, 'color', v.color)
}
export const validateTopicCallout: (value: unknown) => asserts value is TopicCallout = (
  value: unknown,
): asserts value is TopicCallout => {
  const callout = v.record(value, ['id', 'topicId', 'text'])
  assertId(callout.id)
  assertId(callout.topicId)
  v.text(callout.text, 10_000)
}
export const validateFloatingPosition: (value: unknown) => asserts value is FloatingPosition = (
  value: unknown,
): asserts value is FloatingPosition => {
  const position = v.record(value, ['x', 'y'])
  v.number(position.x, -1_000_000, 1_000_000)
  v.number(position.y, -1_000_000, 1_000_000)
}
export { validatePresentationStep } from '@core/presentation-validation'
