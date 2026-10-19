import type { PresentationStep } from '@core/extensions'
import * as v from '@core/extension-validation'
import { assertId } from '@core/validation'

export const validatePresentationStep: (value: unknown) => asserts value is PresentationStep = (
  value: unknown,
): asserts value is PresentationStep => {
  const step = v.record(value, ['topicId', 'camera', 'layout', 'hidden', 'notes', 'reveal'])
  assertId(step.topicId)
  v.optional(step, 'layout', (entry) => {
    v.oneOf(entry, ['auto', 'list', 'image', 'structure'])
  })
  v.optional(step, 'hidden', v.boolean)
  v.optional(step, 'notes', (entry) => {
    v.text(entry, 10_000, true)
  })
  v.optional(step, 'reveal', (entry) => {
    v.oneOf(entry, ['all', 'items'])
  })
  v.optional(step, 'camera', (entry) => {
    const camera = v.record(entry, ['position', 'target'])
    for (const vector of [camera.position, camera.target])
      for (const component of v.list(vector, 3, 3)) v.number(component, -10_000_000, 10_000_000)
  })
}
