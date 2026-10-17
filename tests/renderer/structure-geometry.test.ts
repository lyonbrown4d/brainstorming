import { describe, expect, it } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { applyCommand, createExampleDocument, type LayoutKind } from '@core'
import { layoutDocument } from '@layout'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { renderSheetSvg } from '@renderer/export/svg'
import { documentStructureKey, layoutDecorationPath, layoutEdgePath } from '@shared/layout-geometry'

describe('structure canvas and export geometry', () => {
  it.each<LayoutKind>([
    'tree-down',
    'tree-up',
    'brace-right',
    'brace-left',
    'fishbone',
    'timeline',
    'timeline-vertical',
    'matrix',
    'tree-table-right',
    'tree-table-down',
  ])('renders the same %s paths and decorations on canvas and in SVG', (kind) => {
    const document = applyCommand(createExampleDocument(), {
      type: 'setDocumentSettings',
      settings: { layout: kind },
    })
    const projection = projectCanvas(document)
    const layout = layoutDocument(document)
    const { svg, width, height } = renderSheetSvg(document)
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(projection.nodes).toHaveLength(Object.keys(document.topics).length)
    expect(svg).not.toMatch(/NaN|Infinity/)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    for (const edge of projection.edges) {
      if (
        edge.type !== 'structure' ||
        !edge.data ||
        !('path' in edge.data) ||
        typeof edge.data.path !== 'string'
      )
        continue
      expect(edge.data.path).toMatch(/^M /)
      expect(svg).toContain(`d="${edge.data.path}"`)
    }
    const visible = layout.edges.filter((edge) => edge.routing !== 'hidden')
    expect(projection.edges).toHaveLength(visible.length)
    expect(parsed.getElementsByTagName('path').length).toBe(
      visible.length + (layout.decorations ?? []).filter((item) => item.kind !== 'cell').length,
    )
    for (const decoration of projection.decorations) {
      expect(svg).toContain(`data-structure-kind="${decoration.kind}"`)
      if (decoration.kind !== 'cell')
        expect(svg).toContain(`d="${layoutDecorationPath(decoration)}"`)
    }
    for (const topic of Object.values(document.topics)) expect(svg).toContain(topic.title)
  })

  it('honors explicit routes and separates structure changes from typing or theme changes', () => {
    const source = { id: 'a', x: 0, y: 0, width: 100, height: 40, side: 'right' as const }
    const target = { ...source, id: 'b', x: 240, y: 100 }
    const edge = { id: 'e', source: 'a', target: 'b', direction: 'right' as const }
    expect(layoutEdgePath({ ...edge, routing: 'hidden' }, source, target)).toBe('')
    expect(layoutEdgePath({ ...edge, routing: 'orthogonal' }, source, target)).toBe(
      'M 100 20 H 170 V 120 H 240',
    )
    expect(layoutEdgePath(edge, source, target, true)).toBe('M 100 20 L 240 120')
    const document = createExampleDocument()
    const key = documentStructureKey(document)
    expect(
      documentStructureKey(
        applyCommand(document, {
          type: 'renameTopic',
          topicId: 'vision',
          title: '中文内容',
        }),
      ),
    ).toBe(key)
    expect(
      documentStructureKey(
        applyCommand(document, {
          type: 'setDocumentSettings',
          settings: { theme: 'ocean' },
        }),
      ),
    ).toBe(key)
    expect(
      documentStructureKey(
        applyCommand(document, {
          type: 'setTopicStructure',
          topicId: 'vision',
          structure: 'brace-right',
        }),
      ),
    ).not.toBe(key)
  })
})
