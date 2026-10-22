import type { PresentationStep } from '@core/extensions'
import * as v from '@core/extension-validation'
import { assertId } from '@core/validation'

export const validatePresentationStep: (value: unknown) => asserts value is PresentationStep = (
  value: unknown,
): asserts value is PresentationStep => {
  const step = v.record(value, [
    'topicId',
    'camera',
    'layout',
    'hidden',
    'notes',
    'reveal',
    'appearance',
  ])
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
  v.optional(step, 'appearance', (entry) => {
    const appearance = v.record(entry, ['background', 'title', 'body', 'image'])
    v.optional(appearance, 'background', v.color)
    for (const field of ['title', 'body'])
      v.optional(appearance, field, (value) => {
        const style = v.record(value, ['scale', 'color', 'bold', 'align'])
        v.optional(style, 'scale', (value) => {
          v.number(value, 0.75, 1.5)
        })
        v.optional(style, 'color', v.color)
        v.optional(style, 'bold', v.boolean)
        v.optional(style, 'align', (value) => {
          v.oneOf(value, ['left', 'center', 'right'])
        })
      })
    v.optional(appearance, 'image', (value) => {
      const image = v.record(value, ['fit', 'position'])
      v.optional(image, 'fit', (value) => {
        v.oneOf(value, ['contain', 'cover'])
      })
      v.optional(image, 'position', (value) => {
        v.oneOf(value, ['left', 'right'])
      })
    })
  })
  v.optional(step, 'camera', (entry) => {
    const camera = v.record(entry, ['position', 'target'])
    for (const vector of [camera.position, camera.target])
      for (const component of v.list(vector, 3, 3)) v.number(component, -10_000_000, 10_000_000)
  })
}
