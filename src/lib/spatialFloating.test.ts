import { expect, it } from 'vitest'
import { applyCommand, createFixtureDocument } from '@core'
import { layoutDocument } from '@layout'
import { spatialFloatingCommand } from '@renderer/lib/spatialFloating'

it('places a 2D floating idea at the exact canvas position with one ordinary command', () => {
  const command = spatialFloatingCommand('floating-new', 'Free idea', { x: 225, y: -140 })
  expect(command).toEqual({
    type: 'addFloatingTopic',
    id: 'floating-new',
    title: 'Free idea',
    x: 225,
    y: -140,
  })
  const original = createFixtureDocument(2)
  const changed = applyCommand(original, command)
  expect(changed.floatingPositions?.['floating-new']).toEqual({ x: 225, y: -140 })
  expect(changed.topics['floating-new']?.style?.spatialDepth).toBeUndefined()
  const node = layoutDocument(changed).nodes.find((item) => item.id === 'floating-new')
  expect(node?.x).toBe(225)
  expect(node?.y).toBe(-140)
  expect(original.topics['floating-new']).toBeUndefined()
})
