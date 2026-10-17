import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { applyCommand, createExampleDocument } from '@core'
import { layoutDocument } from '@layout'
import { layoutSpatialDocument, type SpatialNode, type SpatialPoint } from '@layout/spatial'
import { canvasDropCommand, findTopicDrop } from '@renderer/lib/canvasDrop'
import {
  createSpatialDrag,
  previewSpatialDrag,
  projectSpatialDropNodes,
  projectSpatialNode,
  spatialDocumentDelta,
  spatialDragDelta,
  spatialDragSelection,
  spatialRectangleSelection,
} from '@renderer/lib/spatialDrag'

const viewport = { left: 120, top: 80, width: 800, height: 400 }
const card: SpatialNode = {
  id: 'vision',
  position: [0, 0, 0],
  width: 2,
  height: 1,
  branchId: 'vision',
  depth: 1,
}

const cameraAt = (position: SpatialPoint = [0, 0, 10]) => {
  const camera = new PerspectiveCamera(50, 2, 0.1, 100)
  camera.position.set(...position)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Missing expected geometry')
  return value
}

describe('spatial screen geometry', () => {
  it('projects camera-facing card bounds after camera rotation and CSS viewport scaling', () => {
    const front = required(projectSpatialNode(card, cameraAt(), viewport))
    const rotated = required(projectSpatialNode(card, cameraAt([6, 3, Math.sqrt(55)]), viewport))
    for (const key of ['left', 'top', 'width', 'height'] as const)
      expect(rotated[key]).toBeCloseTo(front[key], 8)
    const scaled = required(
      projectSpatialNode(card, cameraAt(), { left: 30, top: 20, width: 400, height: 200 }),
    )
    expect(scaled.width).toBeCloseTo(front.width / 2)
    expect(scaled.height).toBeCloseTo(front.height / 2)
    expect(scaled.left - 30).toBeCloseTo((front.left - viewport.left) / 2)
    expect(scaled.top - 20).toBeCloseTo((front.top - viewport.top) / 2)
    expect(front.width).toBeGreaterThan(80)
    expect(front.height).toBeGreaterThan(40)
  })

  it('rejects behind-camera, near-plane and offscreen cards', () => {
    const camera = cameraAt()
    for (const position of [
      [0, 0, 20],
      [0, 0, 9.95],
      [100, 0, 0],
    ] as const)
      expect(projectSpatialNode({ ...card, position }, camera, viewport)).toBeUndefined()
    expect(projectSpatialNode(card, camera, { ...viewport, width: 0 })).toBeUndefined()
  })

  it('uses full-card containment in either rectangle direction', () => {
    const camera = cameraAt([6, 3, Math.sqrt(55)])
    const rect = required(projectSpatialNode(card, camera, viewport))
    const start = { x: rect.left - 1, y: rect.top - 1 }
    const end = { x: rect.left + rect.width + 1, y: rect.top + rect.height + 1 }
    const nodes = [card, { ...card, id: 'other', position: [8, 0, 0] as const }]
    expect(spatialRectangleSelection(nodes, camera, viewport, start, end)).toEqual(['vision'])
    expect(spatialRectangleSelection(nodes, camera, viewport, end, start)).toEqual(['vision'])
    expect(
      spatialRectangleSelection(nodes, camera, viewport, { x: rect.left + 1, y: start.y }, end),
    ).toEqual([])
  })

  it('feeds projected nodes into shared child, sibling and root-side targeting', () => {
    const document = createExampleDocument()
    const camera = cameraAt()
    const projected = projectSpatialDropNodes(
      [card],
      camera,
      viewport,
      new Map([['vision', 'down']]),
    )
    const target = required(projected[0])
    const center = {
      x: target.position.x + target.width / 2,
      y: target.position.y + target.height / 2,
    }
    expect(findTopicDrop(document, projected, new Set(), center)).toMatchObject({
      parentId: 'vision',
    })
    expect(
      findTopicDrop(document, projected, new Set(), { x: target.position.x, y: center.y }),
    ).toMatchObject({ parentId: 'root', index: 0 })
    expect(findTopicDrop(document, projected, new Set(['vision']), center)).toBeUndefined()
    const root = [{ ...target, id: document.rootId }]
    expect(findTopicDrop(document, root, new Set(), { x: center.x - 1, y: center.y })?.side).toBe(
      'left',
    )
    expect(findTopicDrop(document, root, new Set(), center)?.side).toBe('right')
  })
})

describe('spatial dragging', () => {
  it('intersects a camera-facing plane without a pointer-offset jump', () => {
    const camera = cameraAt([6, 3, Math.sqrt(55)])
    const start = { x: 530, y: 265 }
    const drag = required(createSpatialDrag(camera, viewport, start, card.position))
    expect(spatialDragDelta(camera, viewport, start, drag)).toEqual([0, 0, 0])
    const delta = required(
      spatialDragDelta(camera, viewport, { x: start.x + 100, y: start.y - 50 }, drag),
    )
    expect(new Vector3(...delta).dot(drag.plane.normal)).toBeCloseTo(0)
    const moved = new Vector3(...drag.origin).add(new Vector3(...delta)).project(camera)
    expect(viewport.left + ((moved.x + 1) * viewport.width) / 2).toBeCloseTo(start.x + 100)
    expect(viewport.top + ((1 - moved.y) * viewport.height) / 2).toBeCloseTo(start.y - 50)
    expect(Math.abs(delta[2])).toBeGreaterThan(0.1)
    expect(spatialDocumentDelta(delta)).toEqual({ x: delta[0] * 100, y: -delta[1] * 100 })
    expect(
      createSpatialDrag(camera, { ...viewport, height: 0 }, start, card.position),
    ).toBeUndefined()
  })

  it('normalizes overlapping subtrees and previews their nodes and edges without mutations', () => {
    const document = createExampleDocument()
    const layout = layoutSpatialDocument(document)
    const original = JSON.stringify({ document, layout })
    const selection = spatialDragSelection(document, ['vision', 'vision-0', 'users'])
    expect(selection.roots).toEqual(['vision', 'users'])
    expect(selection.ids.has('vision-1')).toBe(true)
    const delta: SpatialPoint = [1.5, -0.7, 0.4]
    const preview = previewSpatialDrag(document, layout, selection.ids, delta)
    for (const [index, node] of layout.nodes.entries()) {
      const moved = required(preview.nodes[index])
      expect(moved.position).toEqual(
        selection.ids.has(node.id)
          ? node.position.map((value, axis) => value + (delta[axis] ?? 0))
          : node.position,
      )
    }
    const incoming = required(layout.edges.find((edge) => edge.target === 'vision'))
    const changed = required(preview.edges.find((edge) => edge.target === 'vision'))
    expect(changed.start).toEqual(incoming.start)
    expect(changed.end).toEqual(incoming.end.map((value, axis) => value + (delta[axis] ?? 0)))
    expect(changed.path).not.toBe(incoming.path)
    expect(JSON.stringify({ document, layout })).toBe(original)
    expect(spatialDragSelection(document, ['root']).roots).toEqual([])
    expect(spatialDragSelection(document, ['root', 'vision', 'vision-0']).roots).toEqual(['vision'])
  })

  it('moves structured decorations and routed endpoints with their owning subtrees', () => {
    const document = applyCommand(createExampleDocument(), {
      type: 'setDocumentSettings',
      settings: { layout: 'fishbone' },
    })
    const planar = layoutDocument(document)
    const layout = layoutSpatialDocument(document)
    const edge = required(
      layout.edges.find((item) => item.waypoints && item.target !== document.rootId),
    )
    const selection = spatialDragSelection(document, [edge.target])
    const delta: SpatialPoint = [1, 0.5, -0.2]
    const preview = previewSpatialDrag(document, layout, selection.ids, delta, planar)
    const movedEdge = required(preview.edges.find((item) => item.id === edge.id))
    expect(movedEdge.start).toEqual(edge.start)
    for (const [axis, value] of edge.end.entries())
      expect(movedEdge.end[axis]).toBeCloseTo(value + (delta[axis] ?? 0))
    const whole = previewSpatialDrag(
      document,
      layout,
      new Set(layout.nodes.map((node) => node.id)),
      delta,
      planar,
    )
    expect(layout.decorations.length).toBeGreaterThan(0)
    for (const [index, decoration] of layout.decorations.entries())
      for (const [axis, value] of decoration.position.entries())
        expect(whole.decorations[index]?.position[axis]).toBeCloseTo(value + (delta[axis] ?? 0))
  })

  it('commits floating world motion as one planar command without persisting depth', () => {
    const document = applyCommand(createExampleDocument(), {
      type: 'addFloatingTopic',
      id: 'floating',
      title: 'Floating',
      x: 1000,
      y: 250,
    })
    const origins = new Map([['floating', { x: 1000, y: 250 }]])
    const command = required(
      canvasDropCommand(
        document,
        ['floating'],
        origins,
        spatialDocumentDelta([1.5, -0.7, 4]),
        undefined,
      ),
    )
    expect(command).toEqual({
      type: 'batch',
      commands: [{ type: 'setFloatingPosition', topicId: 'floating', x: 1150, y: 320 }],
    })
    expect(applyCommand(document, command).floatingPositions?.floating).toEqual({ x: 1150, y: 320 })
    expect(document.floatingPositions?.floating).toEqual({ x: 1000, y: 250 })
  })
})
