import { liveSketchEdgePath } from '@shared/sketch-edges'
import { describe, expect, it } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import {
  TOPIC_SHAPES,
  LAYOUT_KINDS,
  applyCommand,
  createDocument,
  createExampleDocument,
  createHistory,
  executeCommand,
  undo,
  redo,
  serializeDocument,
  deserializeDocument,
  validateDocumentSettings,
  createWorkbook,
} from '@core'
import { layoutDocument } from '@layout'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { renderSheetSvg } from '@renderer/export/svg'
import { encodeXmind } from '@formats/interchange/xmind'
import { importXmind } from '@formats/xmind'
import { sketchFillPath, sketchPath, topicOutlinePath } from '@shared/sketch'
import { layoutDecorationPath } from '@shared/layout-geometry'

const fixture = () =>
  applyCommand(createDocument('完整主题树', 'sketch-sheet'), {
    type: 'batch',
    commands: TOPIC_SHAPES.flatMap((shape) => [
      { type: 'addTopic' as const, parentId: 'root', id: shape, title: `主题 ${shape}` },
      { type: 'setTopicStyle' as const, topicId: shape, style: { shape } },
      { type: 'setTopicNotes' as const, topicId: shape, notes: `备注 ${shape}` },
    ]),
  })

const setSketch = (document = fixture()) =>
  applyCommand(document, {
    type: 'setDocumentSettings',
    settings: { ...document.settings, visualStyle: 'sketch' },
  })

describe('Sheet sketch appearance', () => {
  it('uses one undo entry, preserves all topic content and serializes the style', () => {
    const original = applyCommand(fixture(), {
      type: 'addTopicAttachment',
      topicId: 'card',
      asset: {
        id: 'reference',
        name: '附件.txt',
        mimeType: 'application/octet-stream',
        data: 'dGV4dA==',
      },
    })
    const history = executeCommand(createHistory(original), {
      type: 'setDocumentSettings',
      settings: { visualStyle: 'sketch' },
    })
    expect(history.past).toHaveLength(1)
    expect(history.document.topics).toBe(original.topics)
    expect(history.document.assets).toBe(original.assets)
    expect(layoutDocument(history.document)).toEqual(layoutDocument(original))
    expect(deserializeDocument(serializeDocument(history.document))).toEqual(history.document)
    expect(undo(history).document).toBe(original)
    expect(redo(undo(history)).document).toBe(history.document)
    expect(
      importXmind(encodeXmind(createWorkbook(history.document))).workbook.sheets[0]?.document
        .settings?.visualStyle,
    ).toBe('sketch')
  })

  it.each(['unsupported', null, true, 1, {}])(
    'rejects invalid persisted or command style %j',
    (visualStyle) => {
      expect(() => {
        validateDocumentSettings({ visualStyle })
      }).toThrow()
      expect(() =>
        deserializeDocument(JSON.stringify({ ...fixture(), settings: { visualStyle } })),
      ).toThrow()
    },
  )

  it('regenerates the same outline after cache eviction and varies distinct topic identities', () => {
    const path = topicOutlinePath('rounded', 160, 60)
    const expected = sketchPath(path, 'topic:stable')
    expect(expected).not.toBe(path)
    expect(sketchPath(path, 'topic:other')).not.toBe(expected)
    for (let index = 0; index < 1100; index += 1) sketchPath(path, `topic:evict-${index}`)
    expect(sketchPath(path, 'topic:stable')).toBe(expected)
    expect(expected).not.toMatch(/NaN|Infinity|undefined/)
    const fill = sketchFillPath(path, 'topic:stable')
    expect(fill).not.toBe(expected)
    expect(fill).toBe(sketchFillPath(path, 'topic:stable'))
    expect(fill).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('follows live node endpoints during drag without changing the persisted geometry', () => {
    const source = { id: 'a', x: 0, y: 0, width: 100, height: 40, side: 'right' as const }
    const target = { ...source, id: 'b', x: 240, y: 100 }
    const geometry = {
      source,
      target,
      straight: false,
      edge: { id: 'e', source: 'a', target: 'b' },
    }
    const before = liveSketchEdgePath(
      geometry,
      { x: 100, y: 20 },
      { x: 240, y: 120 },
      'right',
      'left',
    )
    const moved = liveSketchEdgePath(
      geometry,
      { x: 100, y: 20 },
      { x: 290, y: 160 },
      'right',
      'left',
    )
    expect(moved).not.toBe(before)
    expect(
      liveSketchEdgePath(geometry, { x: 100, y: 20 }, { x: -100, y: 120 }, 'right', 'left'),
    ).toBe(sketchPath('M 100 20 C 0 20, 0 120, -100 120', 'edge:e'))
    expect(geometry.target).toBe(target)
    expect(
      liveSketchEdgePath(geometry, { x: 100, y: 20 }, { x: 240, y: 120 }, 'right', 'left'),
    ).toBe(before)
  })

  it.each(TOPIC_SHAPES)(
    'preserves %s silhouette and all text with shared exported sketch paths',
    (shape) => {
      const document = setSketch()
      const layout = layoutDocument(document)
      const node = layout.nodes.find((item) => item.id === shape)
      if (!node) throw new Error('missing fixture topic')
      const { svg } = renderSheetSvg(document)
      expect(svg).toContain(`主题 ${shape}`)
      if (shape === 'sticky' || shape === 'card') expect(svg).toContain(`备注 ${shape}`)
      if (shape !== 'text') {
        const outline = sketchPath(
          topicOutlinePath(shape, node.width, node.height),
          `topic:${shape}`,
        )
        expect(svg).toContain(`d="${outline}"`)
        expect(svg).toContain(
          `d="${sketchFillPath(topicOutlinePath(shape, node.width, node.height), `topic:${shape}`)}"`,
        )
      }
      expect(renderSheetSvg(deserializeDocument(serializeDocument(document))).svg).toBe(svg)
    },
  )

  it('keeps ordinary leaves clear and shades explicit fills without altering text', () => {
    const document = setSketch(createExampleDocument())
    const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml')
    const fills = (svg: string) =>
      Array.from(parse(svg).getElementsByTagName('path')).filter(
        (path) => path.getAttribute('data-sketch') === 'fill',
      )
    const before = renderSheetSvg(document).svg
    const root = document.topics[document.rootId]
    expect(fills(before)).toHaveLength(1 + (root?.children.length ?? 0))
    const filled = applyCommand(document, {
      type: 'setTopicStyle',
      topicId: 'vision-1',
      style: { fill: '#f9e9c2' },
    })
    expect(fills(renderSheetSvg(filled).svg)).toHaveLength(fills(before).length + 1)
    expect(renderSheetSvg(filled).svg).toContain('本地优先')
  })

  it.each(LAYOUT_KINDS)('shares %s branch and decoration geometry with SVG export', (layout) => {
    const document = setSketch(
      applyCommand(createExampleDocument(), {
        type: 'setDocumentSettings',
        settings: { layout },
      }),
    )
    const projection = projectCanvas(document)
    const svg = renderSheetSvg(document).svg
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const paths = Array.from(parsed.getElementsByTagName('path'))
    expect(svg).not.toMatch(/NaN|Infinity|undefined/)
    expect(
      projection.nodes
        .filter((node) => node.type !== 'ink')
        .every((node) => node.data.visualStyle === 'sketch'),
    ).toBe(true)
    for (const edge of projection.edges) {
      expect(edge.type).toBe('structure')
      if (!edge.data || !('path' in edge.data)) throw new Error('missing sketch branch')
      expect(paths.some((path) => path.getAttribute('d') === edge.data?.path)).toBe(true)
    }
    for (const decoration of projection.decorations) {
      const expected = sketchPath(layoutDecorationPath(decoration), `decoration:${decoration.id}`)
      expect(
        paths.some(
          (path) =>
            path.getAttribute('data-structure-kind') === decoration.kind &&
            path.getAttribute('d') === expected,
        ),
      ).toBe(true)
    }
  })
})
