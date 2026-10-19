import { describe, expect, it } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { TOPIC_SHAPES, applyCommand, createDocument, createWorkbook } from '@core'
import { encodeXmind } from '@formats/interchange/xmind'
import { importXmind } from '@formats/xmind'
import { importStyle } from '@formats/xmind/styles'
import { Warnings } from '@formats/xmind/common'
import { measureTopic } from '@layout'
import { topicNotesPreview, topicShapeInsets, topicShapePath } from '@shared/topic-shapes'
import { renderSheetSvg } from '@renderer/export/svg'

const fixture = () =>
  applyCommand(createDocument('保留标题', 'appearance-export'), {
    type: 'setTopicNotes',
    topicId: 'root',
    notes: '备注正文保持完整',
  })

describe('topic appearances across layout and file formats', () => {
  it('preserves manual width through XMind and wraps SVG text to the chosen width', () => {
    const title = '手动调整主题宽度'.repeat(8)
    const original = createDocument(title, 'width-export')
    const narrow = applyCommand(original, {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { width: 100 },
    })
    const wide = applyCommand(original, {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { width: 600 },
    })
    const imported = importXmind(encodeXmind(createWorkbook(narrow)))
    expect(imported.workbook.sheets[0]?.document.topics.root?.style?.width).toBe(100)
    const lineCount = (document: typeof narrow): number =>
      new DOMParser()
        .parseFromString(renderSheetSvg(document).svg, 'image/svg+xml')
        .getElementsByTagName('tspan').length
    expect(lineCount(narrow)).toBeGreaterThan(lineCount(wide))
  })

  it.each(TOPIC_SHAPES)(
    'preserves %s, title and notes through XMind and vector export',
    (shape) => {
      const document = applyCommand(fixture(), {
        type: 'setTopicStyle',
        topicId: 'root',
        style: { shape },
      })
      const imported = importXmind(encodeXmind(createWorkbook(document)))
      const topic = imported.workbook.sheets[0]?.document.topics.root
      expect(topic).toMatchObject({
        title: '保留标题',
        notes: '备注正文保持完整',
        style: { shape },
      })
      const { svg } = renderSheetSvg(document)
      const xml = new DOMParser().parseFromString(svg, 'image/svg+xml')
      expect(xml.getElementsByTagName('tspan')[0]?.textContent).toBe('保留标题')
      const group = Array.from(xml.getElementsByTagName('g')).find((item) =>
        Array.from(item.childNodes).some((child) => child.nodeName === 'g'),
      )
      expect(group).toBeDefined()
      const shapeNode = group?.firstChild
      if (shape === 'text') expect(shapeNode?.nodeName).toBe('g')
      else if (shape === 'circle' || shape === 'ellipse')
        expect(shapeNode?.nodeName).toBe('ellipse')
      else expect(shapeNode?.nodeName).toBe('path')
      if (shape === 'card' || shape === 'sticky') expect(svg).toContain('备注正文保持完整')
      if (shape === 'image') {
        expect(svg).toContain('添加图片')
        expect(svg).not.toContain('<image')
      }
    },
  )

  it.each(TOPIC_SHAPES)(
    'reserves a safe content rectangle for %s without changing stored text',
    (shape) => {
      const topic = { notes: '备注', style: { shape } }
      const plain = measureTopic('原有标题', false, undefined, { notes: topic.notes })
      const measured = measureTopic('原有标题', false, undefined, topic)
      const inset = topicShapeInsets(shape)
      expect(measured.width * (1 - inset.x * 2)).toBeGreaterThanOrEqual(plain.width)
      expect(measured.height * (1 - inset.y * 2)).toBeGreaterThanOrEqual(plain.height)
      if (shape === 'circle') expect(measured.width).toBe(measured.height)
      expect(topicShapePath(shape, measured.width, measured.height)).not.toMatch(
        /NaN|undefined|Infinity/,
      )
    },
  )

  it('imports supported standard XMind shapes and reports unrecognized shapes', () => {
    const warnings = new Warnings()
    for (const [name, expected] of [
      ['diamond', 'diamond'],
      ['cloud', 'cloud'],
      ['callout', 'speech'],
      ['noShape', 'text'],
    ] as const)
      expect(
        importStyle({ properties: { 'shape-class': `org.xmind.topicShape.${name}` } }, warnings)
          ?.shape,
      ).toBe(expected)
    expect(warnings.values().length).toBe(0)
    expect(
      importStyle({ properties: { 'shape-class': 'org.xmind.topicShape.unrecognized' } }, warnings),
    ).toBeUndefined()
    expect(warnings.values().length).toBe(1)
  })
  it('keeps the cloud control polygon inside the reserved node bounds', () => {
    const width = 320
    const height = 160
    const coordinates =
      topicShapePath('cloud', width, height)
        .match(/-?\d+(?:\.\d+)?/g)
        ?.map(Number) ?? []
    expect(coordinates.length).toBeGreaterThan(10)
    coordinates.forEach((coordinate, index) => {
      expect(coordinate).toBeGreaterThanOrEqual(0)
      expect(coordinate).toBeLessThanOrEqual(index % 2 === 0 ? width : height)
    })
  })

  it('centers circular topic content within the enlarged body and rejects XML-invalid notes', () => {
    const circle = applyCommand(createDocument('圆形标题'), {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { shape: 'circle' },
    })
    const xml = new DOMParser().parseFromString(renderSheetSvg(circle).svg, 'image/svg+xml')
    const text = xml.getElementsByTagName('text')[0]
    expect(Number(text?.getAttribute('y'))).toBeGreaterThan(60)
    const sticky = applyCommand(fixture(), {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { shape: 'sticky' },
    })
    const invalid = applyCommand(sticky, {
      type: 'setTopicNotes',
      topicId: 'root',
      notes: '非法\u0000备注',
    })
    expect(() => renderSheetSvg(invalid)).toThrow('XML')
    expect(topicNotesPreview(`${'a'.repeat(159)}😀之后`)).toBe(`${'a'.repeat(159)}😀`)
  })
})
