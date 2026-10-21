import { expect, it } from 'vitest'
import { applyCommand, createFixtureDocument } from '@core'
import { layoutDocument, measureTopic } from '@layout'
import { spatialFloatingCommand } from '@renderer/lib/spatialFloating'
import { projectSpatialLayout } from '@renderer/lib/spatialProjection'
import type { SpatialView } from '@renderer/state/spatialView'

const click = { x: 225, y: -140 }
const title = 'Free idea'
const cases: readonly SpatialView[] = [
  { mode: '3d', yaw: 0, pitch: 0, spacing: 100 },
  { mode: '3d', yaw: Math.PI / 2, pitch: 0.4, spacing: 100 },
  { mode: '3d', yaw: Math.PI, pitch: Math.PI / 3, spacing: 100 },
  {
    mode: '3d',
    yaw: -2.4,
    pitch: -0.9,
    spacing: 100,
    target: { x: 340, y: -230, z: 180 },
  },
]

it.each(cases)('places a measured floating card at the clicked top-left in 3D', (view) => {
  const command = spatialFloatingCommand('floating-new', title, click, view)
  if (command.type !== 'batch') throw new Error('3D placement must be one batch')
  expect(command.commands[0]).toMatchObject({ type: 'addFloatingTopic', id: 'floating-new', title })
  const style = command.commands[1]
  if (style?.type !== 'setTopicStyle') throw new Error('missing spatial depth command')
  expect(style.topicId).toBe('floating-new')
  expect(typeof style.style.spatialDepth).toBe('number')
  const document = applyCommand(createFixtureDocument(2), command)
  const native = layoutDocument(document)
  const node = native.nodes.find((item) => item.id === 'floating-new')
  const size = measureTopic(title)
  expect(node?.width).toBe(size.width)
  expect(node?.height).toBe(size.height)
  expect(node?.x).toBeCloseTo(document.floatingPositions?.['floating-new']?.x ?? Number.NaN)
  expect(node?.y).toBeCloseTo(document.floatingPositions?.['floating-new']?.y ?? Number.NaN)
  const projected = projectSpatialLayout(document, native, view)
  const placed = projected.nodes.find((item) => item.id === 'floating-new')
  expect(placed?.x).toBeCloseTo(click.x, 8)
  expect(placed?.y).toBeCloseTo(click.y, 8)
})

it('keeps the existing single-command position in 2D', () => {
  const view: SpatialView = { mode: '2d', yaw: 0.8, pitch: 0.3, spacing: 100 }
  expect(spatialFloatingCommand('floating-new', title, click, view)).toEqual({
    type: 'addFloatingTopic',
    id: 'floating-new',
    title,
    x: click.x,
    y: click.y,
  })
})
