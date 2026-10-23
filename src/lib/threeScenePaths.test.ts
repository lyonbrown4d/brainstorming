import { describe, expect, it } from 'vitest'
import { createDocument, type MindMapDocument } from '@core'
import { createIndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { collectSceneRoutes, sceneLineVertex, sceneNode } from '@renderer/lib/threeScenePaths'
import { relationLayoutGeometry } from '@shared/relation-geometry'
import { layoutEdgePath } from '@shared/layout-geometry'

const document: MindMapDocument = {
  ...createDocument('Root', 'spatial-tests'),
  topics: {
    root: { id: 'root', title: 'Root', children: ['child'], collapsed: false, side: 'right' },
    child: { id: 'child', title: 'Child', children: [], collapsed: false, side: 'right' },
  },
  relations: [
    {
      id: 'manual',
      from: 'root',
      to: 'child',
      routing: 'curve',
      controlPoints: [
        { x: -40, y: 80 },
        { x: 60, y: -80 },
      ],
    },
  ],
}
const makeRuntime = () =>
  createIndependentSpatialRuntime({
    document,
    surface: '#ffffff',
    depths: { root: 10, child: 110 },
    layout: {
      nodes: [
        { id: 'root', x: 0, y: 10, width: 100, height: 40, side: 'right' },
        { id: 'child', x: 300, y: 70, width: 120, height: 60, side: 'right' },
      ],
      edges: [{ id: 'branch', source: 'root', target: 'child', routing: 'orthogonal' }],
    },
  })

describe('independent spatial connection geometry', () => {
  it('retains shared orthogonal and manually controlled relation routes', () => {
    const runtime = makeRuntime()
    const [from, to] = runtime.model.layout.nodes
    const relation = document.relations?.[0]
    if (!from || !to || !relation) throw new Error('Missing test fixture')
    const routes = collectSceneRoutes(runtime)
    expect(routes[0]?.path).toBe(
      layoutEdgePath(runtime.model.layout.edges[0] ?? { id: '', source: '', target: '' }, from, to),
    )
    expect(routes[1]?.path).toBe(relationLayoutGeometry(relation, from, to).path)
    expect(routes[1]?.arrow).toBe('end')
  })

  it('follows preview movement, scaling, and relation controls without changing the document', () => {
    const runtime = makeRuntime()
    const relation = document.relations?.[0]
    const from = runtime.model.layout.nodes[0],
      to = runtime.model.layout.nodes[1]
    if (!relation || !from || !to) throw new Error('Missing test fixture')
    runtime.offsets.set('child', { x: 50, y: -20, z: 30 })
    runtime.scales.set('child', 2)
    runtime.relationPreviews.set('manual', { ...relation, routing: 'straight' })
    const routes = collectSceneRoutes(runtime)
    const target = sceneNode(runtime, to)
    expect(target).toMatchObject({ x: 290, y: 20, width: 240, height: 120 })
    expect(routes[1]?.path).toBe(
      relationLayoutGeometry({ ...relation, routing: 'straight' }, from, target).path,
    )
    expect(routes[1]?.targetDepth).toBe(140)
    expect(runtime.model.document).toBe(document)
    expect(to.x).toBe(300)
  })

  it('keeps true world centers and billboard-local endpoint anchors separate', () => {
    const route = collectSceneRoutes(makeRuntime())[0]
    if (!route) throw new Error('Missing test fixture')
    expect(sceneLineVertex(route, { x: 100, y: 30 }, 0)).toEqual({
      center: [50, -30, 10],
      anchor: [50, 0],
    })
    expect(sceneLineVertex(route, { x: 300, y: 100 }, 1)).toEqual({
      center: [360, -100, 110],
      anchor: [-60, 0],
    })
    expect(sceneLineVertex(route, { x: 200, y: 80 }, 0.5)).toEqual({
      center: [205, -65, 60],
      anchor: [-5, -15],
    })
  })
})

describe('spatial annotation anchors', () => {
  it('shares group bounds and follows member previews at their average depth', async () => {
    const { sceneAnnotationGeometry } = await import('@renderer/lib/threeSceneAnnotations')
    const runtime = makeRuntime()
    runtime.model = {
      ...runtime.model,
      document: {
        ...document,
        groups: [{ id: 'area', topicIds: ['root', 'child'], kind: 'boundary', title: 'Area' }],
        callouts: [{ id: 'note', topicId: 'child', text: 'Remember' }],
      },
    }
    runtime.offsets.set('child', { x: 40, y: -20, z: 20 })
    const geometry = sceneAnnotationGeometry(runtime)
    expect(geometry.fills[0]).toMatchObject({
      center: [230, -55, 70],
      size: [492, 142],
      opacity: 0.04,
    })
    expect(geometry.anchors[0]).toMatchObject({
      id: 'area',
      kind: 'group',
      offset: [-238, 91],
      text: 'Area',
    })
    expect(geometry.anchors[1]).toMatchObject({
      id: 'note',
      kind: 'callout',
      center: [400, -80, 130],
      offset: [74, 46],
      width: 192,
    })
    expect(collectSceneRoutes(runtime).at(-1)?.id).toBe('group-area')
  })
})
