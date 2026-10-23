import { expect, it, vi } from 'vitest'
import { applyCommand, createFixtureDocument } from '@core'
import { layoutDocument } from '@layout'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'
import {
  completeCanvasFrame,
  type CanvasProjectionFrame,
} from '@renderer/lib/canvasProjectionFrame'
import { createCanvasProjectionController } from '@renderer/lib/canvasProjectionController'

const document = createFixtureDocument(3)
const layout = layoutDocument(document)
const scopeId = 'book/sheet/document'
const project = createCanvasProjector()
const frame = completeCanvasFrame(
  null,
  { scopeId, document, layout, placeholder: false, surface: undefined },
  project,
)
if (frame?.phase !== '2d') throw new Error('missing canonical 2D fixture')

it('keeps canonical 2D geometry out of pointer previews and does not republish the same complete frame', () => {
  const controller = createCanvasProjectionController(scopeId)
  controller.updateFrame(frame)
  const before = controller.getProjection()
  const live = before.nodes.map((node) => ({ ...node, position: { x: 999, y: 999 } }))
  const changed = vi.fn()
  const stop = controller.subscribe(changed)
  controller.updateFrame(frame)
  expect(controller.getProjection()).toBe(before)
  expect(controller.getProjection().nodes[0]?.position).not.toEqual(live[0]?.position)
  expect(changed).not.toHaveBeenCalled()
  expect(controller.getState().document).toBe(document)
  stop()
})

it('retains complete native geometry during refresh, reissues cached undo geometry and rejects another scope', () => {
  const controller = createCanvasProjectionController(scopeId)
  controller.updateFrame(frame)
  const before = controller.getProjection().nodes
  const changed = applyCommand(document, { type: 'renameTopic', topicId: 'root', title: 'Pending' })
  const source = {
    scopeId,
    document: changed,
    layout: undefined,
    placeholder: true,
    surface: undefined,
  }
  const pending = completeCanvasFrame(frame, source, project)
  controller.updateFrame(pending)
  expect(controller.getState().document).toBe(document)
  expect(controller.getProjection().nodes[0]?.data).toEqual(before[0]?.data)
  const restored = completeCanvasFrame(
    pending,
    { ...source, document, layout, placeholder: false },
    project,
  )
  controller.updateFrame(restored)
  expect(controller.getProjection().nodes).not.toBe(before)
  expect(controller.getProjection().nodes.map((node) => node.position)).toEqual(
    before.map((node) => node.position),
  )
  controller.updateFrame({ ...frame, scopeId: 'other-book/sheet/document' })
  expect(controller.getProjection().nodes).toEqual([])
  expect(controller.getState().document).toBeNull()
})

it('rejects legacy 3D projection frames so a 2D controller cannot become a perspective renderer', () => {
  const controller = createCanvasProjectionController(scopeId)
  controller.updateFrame(frame)
  const spatial: CanvasProjectionFrame = {
    phase: '3d',
    scopeId,
    pending: false,
    refreshGeometry: false,
    document,
    layout,
    depths: {},
  }
  controller.updateFrame(spatial)
  expect(controller.getProjection().nodes).toEqual([])
  expect(controller.getState().document).toBeNull()
})
