import { describe, expect, it } from 'vitest'
import { applyCommand, createExampleDocument, createFixtureDocument } from '@core'
import { layoutDocument } from '@layout'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'

describe('canvas projection identity', () => {
  it('reuses unchanged nodes and edges when only one topic fill changes', () => {
    const document = createExampleDocument()
    const project = createCanvasProjector()
    const before = project(document, '#ffffff')
    expect(project(document, '#ffffff')).toBe(before)
    const id = document.rootId
    const changed = applyCommand(document, {
      type: 'setTopicStyle',
      topicId: id,
      style: { fill: '#fedcba' },
    })
    const after = project(changed, '#ffffff')
    expect(after.nodes.find((node) => node.id === id)).not.toBe(
      before.nodes.find((node) => node.id === id),
    )
    for (const node of after.nodes.filter((entry) => entry.id !== id))
      expect(node).toBe(before.nodes.find((entry) => entry.id === node.id))
    expect(after.edges).toBe(before.edges)
  })

  it('reprojects theme and independent documents instead of leaking cached node content', () => {
    const document = createExampleDocument()
    const project = createCanvasProjector()
    const light = project(document, '#ffffff')
    const dark = project(document, '#202020')
    expect(dark).not.toBe(light)
    const changed = applyCommand(document, {
      type: 'renameTopic',
      topicId: document.rootId,
      title: '另一个导图',
    })
    expect(
      project(changed)
        .nodes.filter((node) => node.type !== 'ink')
        .find((node) => node.id === document.rootId)?.data.topic.title,
    ).toBe('另一个导图')
    expect(
      project(document)
        .nodes.filter((node) => node.type !== 'ink')
        .find((node) => node.id === document.rootId)?.data.topic.title,
    ).toBe(document.title)
  })

  it('updates moved geometry while preserving unchanged neighbors and equivalent edge paths', () => {
    const document = createFixtureDocument(2)
    const layout = layoutDocument(document)
    const routed = {
      ...layout,
      edges: layout.edges.map((edge) => ({ ...edge, routing: 'orthogonal' as const })),
    }
    const project = createCanvasProjector()
    const before = project(document, routed)
    const movedLayout = {
      ...routed,
      nodes: routed.nodes.map((node) =>
        node.id === 'topic-1' ? { ...node, x: node.x + 40 } : node,
      ),
    }
    const moved = project(document, movedLayout)
    expect(moved.nodes.find((node) => node.id === 'root')).toBe(
      before.nodes.find((node) => node.id === 'root'),
    )
    expect(moved.nodes.find((node) => node.id === 'topic-1')?.position.x).toBe(
      (before.nodes.find((node) => node.id === 'topic-1')?.position.x ?? 0) + 40,
    )
    expect(moved.edges[0]?.data?.path).not.toBe(before.edges[0]?.data?.path)
    // A matching path still requires the complete live geometry comparison.
    const depthOnly = project(document, {
      ...movedLayout,
      nodes: movedLayout.nodes.map((node) => ({ ...node, cameraDepth: 100 })),
    })
    expect(depthOnly.edges[0]?.data?.path).toBe(moved.edges[0]?.data?.path)
    expect(depthOnly.edges[0]).not.toBe(moved.edges[0])
    const equivalent = project(document, {
      ...movedLayout,
      nodes: movedLayout.nodes.map((node) => ({ ...node, cameraDepth: 100 })),
    })
    expect(equivalent.nodes).toBe(depthOnly.nodes)
    expect(equivalent.edges).toBe(depthOnly.edges)
  })

  it('keeps the current valid projection after rejecting a malformed document', () => {
    const document = createExampleDocument()
    const project = createCanvasProjector()
    const valid = project(document)
    expect(() => project({ ...document, rootId: 'missing' })).toThrow()
    expect(project(document)).toBe(valid)
  })
})
