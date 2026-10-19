import { describe, expect, it } from 'vitest'
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import { applyCommand, createDocument } from '@core'
import { drawExportInk, inkExtents } from '@renderer/export/ink'

describe('drawing SVG export', () => {
  it('includes offscreen stroke bounds and shares the pressure outline with the canvas', () => {
    const document = applyCommand(createDocument('Ink'), {
      type: 'upsertDrawing',
      stroke: {
        id: 'ink-1',
        color: '#123abc',
        width: 8,
        points: [
          { x: -5000, y: 100, pressure: 0.5 },
          { x: -4000, y: 300, pressure: 1 },
        ],
      },
    })
    expect(inkExtents(document)).toEqual([{ x: -5008, y: 92, width: 1016, height: 216 }])
    const xml = new DOMImplementation().createDocument('http://www.w3.org/2000/svg', 'svg', null)
    if (!xml.documentElement) throw new Error('Missing SVG root')
    drawExportInk(xml, xml.documentElement, document)
    const svg = new XMLSerializer().serializeToString(xml)
    expect(svg).toContain('data-drawing-id="ink-1"')
    expect(svg).toContain('fill="#123abc"')
    expect(svg).toContain('d="M')
  })
})
