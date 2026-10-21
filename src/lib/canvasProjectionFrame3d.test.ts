import { expect, it, vi } from 'vitest'
import { createExampleDocument } from '@core'
import { layoutDocument } from '@layout'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'
import {
  completeCanvasFrame,
  type CanvasProjectionFrame,
} from '@renderer/lib/canvasProjectionFrame'
import { projectSpatialLayout } from '@renderer/lib/spatialProjection'
import type { SpatialView } from '@renderer/state/spatialView'

it('reissues a 3D node array after a pending native layout resolves to cached undo geometry', () => {
  const document = createExampleDocument()
  const layout = layoutDocument(document)
  const depths = Object.fromEntries(layout.nodes.map((node) => [node.id, 0]))
  const view: SpatialView = { mode: '3d', yaw: 0.4, pitch: 0.3, spacing: 100 }
  const baseProject = vi.fn(createCanvasProjector())
  const spatialProject = createCanvasProjector()
  const source = {
    scopeId: 'book/sheet',
    document,
    layout,
    depths,
    deferProjection: true,
    placeholder: false,
    surface: undefined,
  }
  const render = (frame: CanvasProjectionFrame) => {
    if (frame.phase !== '3d' || !frame.depths) throw new Error('missing 3D frame')
    return spatialProject(
      frame.document,
      projectSpatialLayout(frame.document, frame.layout, view, frame.depths),
      undefined,
      frame.refreshGeometry,
      view,
    )
  }
  const first = completeCanvasFrame(null, source, baseProject)
  if (!first) throw new Error('missing first frame')
  const firstNodes = render(first).nodes
  const pending = completeCanvasFrame(
    first,
    { ...source, layout: undefined, placeholder: true },
    baseProject,
  )
  if (!pending) throw new Error('missing retained frame')
  expect(pending.pending).toBe(true)
  expect(render(pending).nodes).toBe(firstNodes)
  const restored = completeCanvasFrame(pending, source, baseProject)
  if (!restored) throw new Error('missing restored frame')
  expect(restored.refreshGeometry).toBe(true)
  const restoredNodes = render(restored).nodes
  expect(restoredNodes).not.toBe(firstNodes)
  expect(restoredNodes.map((node) => node.position)).toEqual(
    firstNodes.map((node) => node.position),
  )
  expect(baseProject).not.toHaveBeenCalled()
})
