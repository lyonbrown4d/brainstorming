import { expect, it } from 'vitest'
import { topicShapeImage } from '@renderer/lib/topicShapeImage'
import { topicShapePath } from '@shared/topic-shapes'

const markup = (shape: Parameters<typeof topicShapeImage>[0], width = 100, height = 40) => {
  const image = topicShapeImage(shape, width, height, '#abc8', '#123456')
  if (!image) throw new Error('Valid topic shape image was not generated')
  return decodeURIComponent(image.src.slice('data:image/svg+xml,'.length))
}

it('preserves exact normal path geometry, colors and stroke overflow padding', () => {
  const image = topicShapeImage('rounded', 123.5, 45.25, '#abc8', '#123456')
  expect(image).toMatchObject({ width: 129.5, height: 51.25 })
  expect(markup('rounded', 123.5, 45.25)).toBe(
    '<svg xmlns="http://www.w3.org/2000/svg" width="129.5" height="51.25" ' +
      'viewBox="-3 -3 129.5 51.25" preserveAspectRatio="none">' +
      `<path d="${topicShapePath('rounded', 123.5, 45.25)}" ` +
      'fill="#abc8" stroke="#123456" stroke-width="1.5"/></svg>',
  )
})

it('retains ellipse geometry and the card and sticky additional strokes', () => {
  for (const shape of ['ellipse', 'circle'] as const)
    expect(markup(shape)).toContain(
      '<ellipse cx="50" cy="20" rx="50" ry="20" fill="#abc8" stroke="#123456" stroke-width="1.5"/>',
    )
  expect(markup('card')).toContain(
    '<path d="M8 4.8 H92" fill="none" stroke="#123456" stroke-width="3"/>',
  )
  expect(markup('sticky')).toContain('<path d="M84 40 V33.6 H100" fill="none" stroke="#123456"/>')
})

it('accepts only resolved hex colors and finite positive bounded dimensions', () => {
  for (const color of ['#abc', '#ABCD', '#123456', '#12345678'])
    expect(topicShapeImage('rounded', 100, 40, color, color)).not.toBeNull()
  for (const color of ['red', 'var(--fill)', '#12', '#12345', '#1234567', '#abc"/>', 'url(x)']) {
    expect(topicShapeImage('rounded', 100, 40, color, '#123')).toBeNull()
    expect(topicShapeImage('rounded', 100, 40, '#123', color)).toBeNull()
  }
  for (const dimension of [0, -1, Number.NaN, Infinity, 20_001]) {
    expect(topicShapeImage('rounded', dimension, 40, '#123', '#456')).toBeNull()
    expect(topicShapeImage('rounded', 100, dimension, '#123', '#456')).toBeNull()
  }
  expect(topicShapeImage('rounded', 20_000, 20_000, '#123', '#456')).not.toBeNull()
  expect(topicShapeImage('text', 100, 40, '#123', '#456')).toBeNull()
})

it('reuses identical images, keys theme and geometry changes and evicts old entries', () => {
  const image = topicShapeImage('rounded', 100, 40, '#111', '#222')
  expect(topicShapeImage('rounded', 100, 40, '#111', '#222')).toBe(image)
  expect(topicShapeImage('rounded', 100, 40, '#333', '#222')).not.toBe(image)
  expect(topicShapeImage('rounded', 101, 40, '#111', '#222')).not.toBe(image)
  expect(topicShapeImage('rounded', 100, 41, '#111', '#222')).not.toBe(image)
  expect(topicShapeImage('rounded', 100, 40, '#111', '#333')).not.toBe(image)
  expect(topicShapeImage('rectangle', 100, 40, '#111', '#222')).not.toBe(image)
  for (let index = 0; index < 512; index++)
    topicShapeImage('rounded', 200 + index, 40, '#111', '#222')
  expect(topicShapeImage('rounded', 100, 40, '#111', '#222')).not.toBe(image)
  expect(topicShapeImage('rounded', 100, 40, '#111', '#222')?.src).toBe(image?.src)
})
