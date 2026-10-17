import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createExampleDocument,
  createFixtureDocument,
  getVisibleTopicIds,
} from '@core'
import { layoutDocument, measureTopic, measureTopicImage } from '@layout'
import type { LayoutNode } from '@layout'

const assertNoOverlap = (nodes: readonly LayoutNode[]): void => {
  const ordered = [...nodes].sort((a, b) => a.x - b.x)
  for (let index = 0; index < ordered.length; index += 1) {
    const a = ordered[index]
    if (!a) continue
    for (let next = index + 1; next < ordered.length; next += 1) {
      const b = ordered[next]
      if (!b || b.x >= a.x + a.width) break
      if (a.y < b.y + b.height && b.y < a.y + a.height)
        throw new Error(`主题重叠: ${a.id} / ${b.id}`)
    }
  }
}

describe('deterministic bilateral tree layout', () => {
  it('centers the root and puts each branch on its inherited side', () => {
    const document = createExampleDocument()
    const result = layoutDocument(document)
    const root = result.nodes.find((node) => node.id === document.rootId)
    expect(root && [root.x + root.width / 2, root.y + root.height / 2]).toEqual([0, 0])
    for (const node of result.nodes) {
      if (node.id === document.rootId) continue
      expect(node.side === 'left' ? node.x + node.width < 0 : node.x > 0).toBe(true)
    }
    expect(result.edges).toHaveLength(result.nodes.length - 1)
    assertNoOverlap(result.nodes)
  })

  it('omits collapsed descendants and all links to them', () => {
    const document = applyCommand(createExampleDocument(), {
      type: 'toggleCollapse',
      topicId: 'vision',
    })
    const result = layoutDocument(document)
    const visible = getVisibleTopicIds(document)
    expect(new Set(result.nodes.map((node) => node.id))).toEqual(new Set(visible))
    expect(
      result.edges.every((edge) => visible.includes(edge.source) && visible.includes(edge.target)),
    ).toBe(true)
    const collapsedRoot = applyCommand(document, { type: 'toggleCollapse', topicId: 'root' })
    expect(layoutDocument(collapsedRoot).nodes).toHaveLength(1)
    expect(layoutDocument(collapsedRoot).edges).toEqual([])
  })

  it('wraps long Chinese, Latin, newline and emoji titles into bounded widths and growing heights', () => {
    const short = measureTopic('短标题')
    for (const title of [
      '中文长标题'.repeat(20),
      'long words '.repeat(30),
      '一\n二\n三',
      '🌱'.repeat(50),
    ]) {
      const size = measureTopic(title)
      expect(size.width).toBeLessThanOrEqual(240)
      expect(size.height).toBeGreaterThan(short.height)
    }
  })

  it.each([100, 1_000, 5_000])(
    'lays out a fixed %i-topic fixture deterministically without overlap',
    (count) => {
      const document = createFixtureDocument(count)
      const original = JSON.stringify(document)
      const first = layoutDocument(document)
      expect(first).toEqual(layoutDocument(document))
      expect(first.nodes).toHaveLength(count)
      expect(first.edges).toHaveLength(count - 1)
      expect(first.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(
        true,
      )
      expect(JSON.stringify(document)).toBe(original)
      assertNoOverlap(first.nodes)
    },
  )

  it('supports a 5,000-level chain without overflowing the JavaScript stack', () => {
    const result = layoutDocument(createFixtureDocument(5_000, 'deep'))
    expect(result.nodes).toHaveLength(5_000)
    assertNoOverlap(result.nodes)
  })

  it('reserves image and indicator space without changing aspect ratio or overlapping branches', () => {
    const fixture = createFixtureDocument(100)
    const imageAsset = { id: 'image', name: '图.png', mimeType: 'image/png', data: 'AA==' }
    let document = applyCommand(fixture, {
      type: 'setTopicImage',
      topicId: fixture.rootId,
      asset: imageAsset,
      width: 400,
      height: 200,
    })
    for (const [index, topic] of Object.values(fixture.topics).entries()) {
      if (index % 3 !== 0) continue
      document = applyCommand(document, {
        type: 'setTopicImage',
        topicId: topic.id,
        asset: imageAsset,
        width: 100,
        height: 400,
      })
      document = applyCommand(document, { type: 'setTopicNotes', topicId: topic.id, notes: '备注' })
    }
    const image = { assetId: 'image', width: 400, height: 200 }
    const size = measureTopic('短标题', false, undefined, {
      image,
      notes: '备注',
      attachments: ['image'],
    })
    const plain = measureTopic('短标题')
    expect(measureTopicImage(image)).toEqual({ width: 200, height: 100 })
    expect(measureTopicImage({ ...image, width: 100, height: 400 })).toEqual({
      width: 35,
      height: 140,
    })
    expect(size.width).toBeGreaterThanOrEqual(200)
    expect(size.height).toBe(plain.height + 100 + 12 + 28)
    const layout = layoutDocument(document)
    expect(layout).toEqual(layoutDocument(document))
    expect(layout.nodes).toHaveLength(100)
    assertNoOverlap(layout.nodes)
  })
})
