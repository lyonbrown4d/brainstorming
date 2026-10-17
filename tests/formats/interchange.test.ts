import { describe, expect, it } from 'vitest'
import { applyCommand, createDocument, createWorkbook, type MindMapWorkbook } from '@core'
import {
  decodeMarkdown,
  decodeOpml,
  encodeMarkdown,
  encodeOpml,
  encodeXmind,
} from '@formats/interchange'
import { importXmind } from '@formats/xmind'
import { readArchive } from '@formats/archive'
import { createAsset } from '@assets'
import { checkRasterSize, renderSheetSvg } from '@renderer/export/svg'

const fixture = (): MindMapWorkbook => {
  let document = createDocument('中文中心\n第二行 <script>&"', 'map')
  document = applyCommand(document, {
    type: 'addTopic',
    parentId: document.rootId,
    id: 'child',
    title: '分支 * [文字]\n换行',
    side: 'left',
  })
  document = applyCommand(document, { type: 'setTopicNotes', topicId: 'child', notes: '备注\n<&"' })
  document = applyCommand(document, {
    type: 'addTopic',
    parentId: 'child',
    id: 'hidden',
    title: '折叠隐藏主题',
  })
  document = applyCommand(document, { type: 'toggleCollapse', topicId: 'child' })
  const book = createWorkbook(document)
  const first = book.sheets[0]
  if (!first) throw new Error('Fixture lacks sheet')
  return {
    ...book,
    sheets: [
      { ...first, name: '中文画布' },
      { id: 'second', name: '第二画布', document: createDocument('第二中心', 'second') },
    ],
  }
}
const titles = (book: MindMapWorkbook) =>
  book.sheets.map((sheet) =>
    Object.values(sheet.document.topics)
      .map((topic) => topic.title)
      .sort(),
  )

describe('outline interchange', () => {
  it('round trips CommonMark multiline plain titles, escaping markup and multiple sheets', () => {
    const book = fixture()
    const result = decodeMarkdown(encodeMarkdown(book))
    expect(result.sheets.map((sheet) => sheet.name)).toEqual(book.sheets.map((sheet) => sheet.name))
    expect(titles(result)).toEqual(titles(book))
    expect(result.sheets[0]?.document.rootId).not.toBe(book.sheets[0]?.document.rootId)
  })
  it('reads regular heading and list outlines using plain safe text', () => {
    const result = decodeMarkdown(
      '# 计划\n\n## 范围\n\n- **重要**\n  - [链接](https://example.com)\n\n<script>alert(1)</script>',
    )
    expect(titles(result).flat()).toEqual(expect.arrayContaining(['范围', '重要', '链接']))
    expect(result.sheets[0]?.document.assets).toBeUndefined()
  })
  it.each(['- 列表文字', '1. 有序文字', '&copy; 与链接', '第一行\n\n第三行'])(
    'preserves literal Markdown title %s',
    (title) => {
      const workbook = createWorkbook(createDocument(title))
      expect(titles(decodeMarkdown(encodeMarkdown(workbook)))).toEqual([[title]])
    },
  )
  it('round trips OPML multiline titles and notes across sheets without executable markup', () => {
    const book = fixture()
    const encoded = encodeOpml(book)
    const result = decodeOpml(encoded)
    expect(titles(result)).toEqual(titles(book))
    expect(result.sheets.map((sheet) => sheet.name)).toEqual(['中文画布', '第二画布'])
    expect(
      Object.values(result.sheets[0]?.document.topics ?? {}).find((topic) => topic.notes)?.notes,
    ).toBe('备注\n<&"')
    expect(encoded).toContain('&lt;script&gt;')
  })
  it('imports ordinary OPML and rejects XML declarations, invalid XML, empty and oversized outlines', () => {
    expect(
      titles(
        decodeOpml(
          '<opml version="2.0"><head><title>导入</title></head><body><outline text="根"><outline text="子"/></outline></body></opml>',
        ),
      ),
    ).toEqual([['子', '根']])
    expect(() =>
      decodeOpml('<!DOCTYPE opml [<!ENTITY x SYSTEM "file:///etc/passwd">]><opml><body/></opml>'),
    ).toThrow('DTD')
    expect(() => decodeOpml('<opml><body></opml>')).toThrow()
    expect(() => decodeMarkdown('')).toThrow()
    expect(() => decodeMarkdown('a'.repeat(8 * 1024 * 1024 + 1))).toThrow('8 MiB')
    expect(() =>
      decodeOpml(
        `<opml><body>${'<outline text="深">'.repeat(129)}${'</outline>'.repeat(129)}</body></opml>`,
      ),
    ).toThrow('128')
  })
})

describe('whole sheet exports', () => {
  it('wraps long group captions inside the complete export bounds', () => {
    const document = createDocument('根', 'long-caption')
    const plain = renderSheetSvg(document)
    const annotated = applyCommand(document, {
      type: 'upsertGroup',
      group: { id: 'group', kind: 'boundary', topicIds: ['root'], title: '长标题'.repeat(100) },
    })
    const exported = renderSheetSvg(annotated)
    expect(exported.height).toBeGreaterThan(plain.height + 200)
    expect(exported.svg.match(/长标题/g)?.length).toBeGreaterThan(80)
  })
  it('includes annotation and metadata text and rejects XML-incompatible controls before producing a file', () => {
    let document = createDocument('根', 'annotations')
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: 'root',
      id: 'child',
      title: '子主题',
    })
    const plain = renderSheetSvg(document)
    document = applyCommand(document, {
      type: 'setTopicMetadata',
      topicId: 'child',
      metadata: { labels: ['标签'], task: { done: false, priority: 1, progress: 50 } },
    })
    document = applyCommand(document, {
      type: 'setDocumentSettings',
      settings: { background: '#abcdef' },
    })
    document = applyCommand(document, {
      type: 'upsertGroup',
      group: { id: 'group', topicIds: ['root', 'child'], title: '边界标题', kind: 'boundary' },
    })
    document = applyCommand(document, {
      type: 'upsertRelation',
      relation: { id: 'relation', from: 'root', to: 'child', title: '关系标题', arrow: 'both' },
    })
    document = applyCommand(document, {
      type: 'upsertCallout',
      callout: { id: 'callout', topicId: 'child', text: '标注 <script> 不执行' },
    })
    const exported = renderSheetSvg(document)
    expect(exported.width).toBeGreaterThan(plain.width)
    for (const content of [
      '边界标题',
      '关系标题',
      '标注 &lt;script&gt;',
      '标签',
      '50%',
      '#abcdef',
      'marker-end',
    ])
      expect(exported.svg).toContain(content)
    const invalid = createDocument('含控制字符\u0000')
    expect(() => renderSheetSvg(invalid)).toThrow('控制字符')
    expect(() => encodeOpml(createWorkbook(invalid))).toThrow('控制字符')
  })
  it('builds complete escaped SVG beyond the viewport and obeys collapsed option without mutating', () => {
    const book = fixture()
    const document = book.sheets[0]?.document
    if (!document) throw new Error('Fixture lacks document')
    const visible = renderSheetSvg(document)
    const expanded = renderSheetSvg(document, true)
    expect(visible.svg).toContain('中文中心')
    expect(visible.svg).not.toContain('<script>')
    expect(visible.svg).toContain('&lt;script&gt;')
    expect(visible.svg).not.toContain('折叠隐藏主题')
    expect(expanded.svg).toContain('折叠隐藏主题')
    expect(expanded.height).toBeGreaterThan(0)
    expect(document.topics.child?.collapsed).toBe(true)
    expect(() => {
      checkRasterSize(16385, 100)
    }).toThrow('过大')
    expect(() => {
      checkRasterSize(8000, 8000)
    }).toThrow('过大')
    expect(() => {
      checkRasterSize(0, 100)
    }).toThrow('过大')
    expect(() => {
      checkRasterSize(1000, 1000)
    }).not.toThrow()
  })
  it('writes modern XMind preserving sheets, Chinese notes, style and embedded binary resources', () => {
    let document = createDocument('导出中文', 'resources')
    const image = createAsset(
      Uint8Array.from(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1kAAAAASUVORK5CYII=',
          'base64',
        ),
      ),
      '图片.png',
      'image',
    )
    const attachment = createAsset(new Uint8Array([0, 1, 255, 2]), '资料.bin', 'attachment')
    document = applyCommand(document, {
      type: 'setTopicImage',
      topicId: 'root',
      asset: image,
      width: 1,
      height: 1,
    })
    document = applyCommand(document, {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: attachment,
    })
    document = applyCommand(document, {
      type: 'setTopicNotes',
      topicId: 'root',
      notes: '中文\n备注',
    })
    document = applyCommand(document, {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { shape: 'ellipse', fill: '#112233', bold: true },
    })
    const workbook = createWorkbook(document)
    const bytes = encodeXmind(workbook)
    const entries = readArchive(bytes)
    expect(entries.has('content.json')).toBe(true)
    expect(entries.has('manifest.json')).toBe(true)
    expect(
      Array.from(entries.values()).some((entry) =>
        Buffer.from(entry).equals(Buffer.from([0, 1, 255, 2])),
      ),
    ).toBe(true)
    const restored = importXmind(bytes).workbook.sheets[0]?.document
    if (!restored) throw new Error('Import lacks document')
    expect(restored.topics.root?.title).toBe('导出中文')
    expect(restored.topics.root?.notes).toBe('中文\n备注')
    expect(restored.topics.root?.style).toMatchObject({
      shape: 'ellipse',
      fill: '#112233',
      bold: true,
    })
    expect(restored.topics.root?.image).toMatchObject({ width: 1, height: 1 })
    expect(restored.topics.root?.attachments).toHaveLength(1)
    expect(Object.values(restored.assets ?? {}).map((asset) => asset.data)).toContain(
      attachment.data,
    )
    expect(importXmind(encodeXmind(fixture())).workbook.sheets).toHaveLength(2)
  })
})
