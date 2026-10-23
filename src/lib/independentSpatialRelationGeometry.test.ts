import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { createDocument, type Relation } from '@core'
import { createIndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { createIndependentSpatialRelationGeometryReader } from '@renderer/lib/independentSpatialRelationGeometry'

const relation: Relation = { id: 'link', from: 'root', to: 'child', routing: 'straight' }
const fixture = () => {
  const runtime = createIndependentSpatialRuntime({
    document: createDocument('Root', 'relation-cache'),
    surface: '#fff',
    depths: { root: 0, child: 80 },
    layout: {
      nodes: [
        { id: 'root', x: 0, y: 0, width: 100, height: 40, side: 'right' },
        { id: 'child', x: 300, y: 20, width: 120, height: 60, side: 'right' },
      ],
      edges: [],
    },
  })
  const camera = new PerspectiveCamera(42, 1.5, 0.1, 10000)
  camera.position.set(0, 0, 1000)
  camera.updateMatrixWorld()
  runtime.camera = camera
  runtime.canvas = { clientWidth: 1200, clientHeight: 800 } as HTMLCanvasElement
  return {
    runtime,
    camera,
    read: createIndependentSpatialRelationGeometryReader(runtime, relation),
  }
}

describe('spatial relation geometry lifecycle', () => {
  it('reuses world geometry across camera frames while projecting the current camera', () => {
    const { read, camera } = fixture()
    const geometry = read()
    if (!geometry) throw new Error('Missing relation geometry')
    const before = geometry.project(geometry.label)
    camera.position.x += 100
    camera.updateMatrixWorld()
    const after = read('camera')
    expect(after).toBe(geometry)
    expect(after?.project(geometry.label).x).not.toBeCloseTo(before.x)
  })

  it('refreshes mutable offset, scale, depth and relation previews before the next camera frame', () => {
    const { runtime, read } = fixture()
    const before = read()
    runtime.offsets.set('child', { x: 40, y: 30, z: 50 })
    runtime.scales.set('child', 2)
    runtime.relationPreviews.set('link', { ...relation, labelOffset: { x: 60, y: 25 } })
    const preview = read('preview')
    expect(preview).not.toBe(before)
    expect(preview?.end).not.toEqual(before?.end)
    expect(preview?.labelOffset).toEqual({ x: 60, y: 25 })
    expect(read('camera')).toBe(preview)
    runtime.offsets.clear()
    runtime.scales.clear()
    runtime.relationPreviews.clear()
    const reverted = read('preview')
    expect(reverted?.end).toEqual(before?.end)
    expect(reverted?.label).toEqual(before?.label)
  })

  it('reindexes replacement layouts and drops a route whose endpoint was removed', () => {
    const { runtime, read } = fixture()
    const before = read()
    runtime.updateModel({
      ...runtime.model,
      layout: {
        ...runtime.model.layout,
        nodes: runtime.model.layout.nodes.map((node) => ({ ...node, x: node.x + 200 })),
      },
    })
    expect(read('model')?.start.x).toBe((before?.start.x ?? 0) + 200)
    runtime.updateModel({ ...runtime.model, layout: { nodes: [], edges: [] } })
    expect(read('model')).toBeNull()
    expect(read('camera')).toBeNull()
  })
})
