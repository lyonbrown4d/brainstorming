import { afterEach, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, type Topic } from '@core'
import { paintThreeTopicShape } from '@renderer/lib/threeTopicShape'
import { topicShapeImage } from '@renderer/lib/topicShapeImage'
import { topicAppearance } from '@shared/appearance'

afterEach(() => {
  vi.unstubAllGlobals()
})

const paint = (style: NonNullable<Topic['style']> = {}) => {
  const paths: string[] = []
  vi.stubGlobal(
    'Path2D',
    class {
      readonly path: string
      constructor(path: string) {
        this.path = path
        paths.push(path)
      }
    },
  )
  const document = applyCommand(createDocument('Root', 'shape-parity'), {
    type: 'setTopicStyle',
    topicId: 'root',
    style,
  })
  const topic = document.topics.root
  if (!topic) throw new Error('Missing root')
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  }
  const strokes: { color: string; width: number }[] = []
  context.stroke.mockImplementation(() => {
    strokes.push({ color: context.strokeStyle, width: context.lineWidth })
  })
  paintThreeTopicShape(
    context as unknown as CanvasRenderingContext2D,
    {
      document,
      layout: { nodes: [], edges: [] },
      depths: {},
      surface: '#ffffff',
    },
    topic,
    200,
    80,
  )
  return { paths, strokes, context, appearance: topicAppearance(document, 'root', '#ffffff') }
}

it.each(['rounded', 'rectangle', 'capsule', 'diamond', 'sticky', 'card'] as const)(
  '%s uses the same silhouette and root stroke as 2D, with document scaling applied once',
  (shape) => {
    const { paths, strokes, context, appearance } = paint({ shape, scale: 2 })
    const image = topicShapeImage(shape, 100, 40, appearance.fill, appearance.fill)
    if (!image) throw new Error('Missing 2D shape image')
    expect(decodeURIComponent(image.src)).toContain(`d="${paths[0]}"`)
    expect(context.scale).toHaveBeenCalledWith(2, 2)
    expect(strokes[0]).toEqual({ color: appearance.fill, width: 1.5 })
    if (shape === 'card') expect(strokes.at(-1)?.width).toBe(3)
    if (shape === 'sticky') expect(strokes.at(-1)?.width).toBe(1)
  },
)

it('defaults to rounded geometry and leaves a text-only topic without a painted backing', () => {
  expect(paint({ scale: 2 }).paths[0]).toMatch(/^M10 0 H90 Q100 0 100 10/)
  const text = paint({ shape: 'text' })
  expect(text.paths).toEqual([])
  expect(text.context.fill).not.toHaveBeenCalled()
  expect(text.context.stroke).not.toHaveBeenCalled()
})
