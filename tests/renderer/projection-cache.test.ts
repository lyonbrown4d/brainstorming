import { describe, expect, it } from 'vitest'
import { applyCommand, createExampleDocument } from '@core'
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
      project(changed).nodes.find((node) => node.id === document.rootId)?.data.topic.title,
    ).toBe('另一个导图')
    expect(
      project(document).nodes.find((node) => node.id === document.rootId)?.data.topic.title,
    ).toBe(document.title)
  })

  it('keeps the current valid projection after rejecting a malformed document', () => {
    const document = createExampleDocument()
    const project = createCanvasProjector()
    const valid = project(document)
    expect(() => project({ ...document, rootId: 'missing' })).toThrow()
    expect(project(document)).toBe(valid)
  })
})
