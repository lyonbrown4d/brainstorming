import { expect, it } from 'vitest'
import { getSubtreeIds } from '@core/tree'
import { createCanvasDropFinder } from '@renderer/lib/canvasDropIndex'
import { findCanvasDrop } from '@renderer/lib/canvasDrop'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { layoutDocument } from '@layout'
import { projectSpatialLayout } from '@renderer/lib/spatialProjection'
import { createFixtureDocument } from '@core'

it.each(['map', 'org-down', 'fishbone', 'matrix'] as const)(
  'indexed %s targets preserve attachment, halos, sibling ordering and exclusions',
  (layout) => {
    const source = createFixtureDocument(85)
    const document = { ...source, settings: { ...source.settings, layout } }
    const projected = projectCanvas(document).nodes
    const excluded = new Set(getSubtreeIds(document, 'topic-1'))
    const find = createCanvasDropFinder(document, projected, excluded)
    for (const node of projected) {
      const width = Number(node.style?.width),
        height = Number(node.style?.height)
      for (const delta of [
        { x: width / 2, y: height / 2 },
        { x: width / 2, y: -4 },
        { x: width / 2, y: height + 12 },
        { x: width + 13, y: height / 2 },
      ]) {
        const point = { x: node.position.x + delta.x, y: node.position.y + delta.y }
        expect(find(point)).toEqual(findCanvasDrop(document, projected, excluded, point))
      }
    }
    expect(find({ x: 1e9, y: 1e9 })).toBeUndefined()
    expect(find({ x: NaN, y: 0 })).toBeUndefined()
  },
)

it('indexes projected 3D bounds and rebuilds the snapshot for a new gesture', () => {
  const document = createFixtureDocument(40)
  const native = layoutDocument(document)
  const layout = projectSpatialLayout(
    document,
    native,
    {
      mode: '3d',
      yaw: 38,
      pitch: 24,
      spacing: 180,
      cameraDistance: 3000,
    },
    Object.fromEntries(native.nodes.map((node, index) => [node.id, index * -20])),
  )
  const projected = projectCanvas(document, undefined, layout).nodes
  const find = createCanvasDropFinder(document, projected, new Set())
  for (const node of projected) {
    const point = {
      x: node.position.x + Number(node.style?.width) / 2,
      y: node.position.y + Number(node.style?.height) / 2,
    }
    expect(find(point)).toEqual(findCanvasDrop(document, projected, new Set(), point))
  }
  const shifted = projected.map((node) => ({
    ...node,
    position: { x: node.position.x + 1e6, y: node.position.y + 1e6 },
  }))
  const next = createCanvasDropFinder(document, shifted, new Set())
  expect(next({ x: 0, y: 0 })).toBeUndefined()
  expect(
    createCanvasDropFinder(
      document,
      projected,
      new Set(projected.map((node) => node.id)),
    )({ x: 0, y: 0 }),
  ).toBeUndefined()
  expect(createCanvasDropFinder(document, [], new Set())({ x: 0, y: 0 })).toBeUndefined()
})

it('preserves projection order on equal-distance overlapping targets', () => {
  const document = createFixtureDocument(15)
  const nodes = projectCanvas(document)
    .nodes.slice(0, 3)
    .map((node) => ({
      ...node,
      position: { x: 0, y: 0 },
      style: { width: 100, height: 40 },
    }))
  const find = createCanvasDropFinder(document, nodes, new Set())
  expect(find({ x: 50, y: 20 })?.targetId).toBe(nodes[0]?.id)
})
