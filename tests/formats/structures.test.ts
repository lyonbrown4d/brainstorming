import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { applyCommand, createDocument, createWorkbook } from '@core'
import { LAYOUT_KINDS, type LayoutKind } from '@core/extensions'
import { readArchive } from '@formats/archive'
import { encodeXmind } from '@formats/interchange/xmind'
import { deserializeWorkbook, serializeWorkbook } from '@core'
import { importXmind } from '@formats/xmind'

const provider = 'org.brainstorming.interchange'
const pairs = [
  ['map', 'org.xmind.ui.map.unbalanced'],
  ['logic-right', 'org.xmind.ui.logic.right'],
  ['logic-left', 'org.xmind.ui.logic.left'],
  ['org-down', 'org.xmind.ui.org-chart.down'],
  ['org-up', 'org.xmind.ui.org-chart.up'],
  ['timeline', 'org.xmind.ui.timeline.horizontal'],
  ['timeline-vertical', 'org.xmind.ui.timeline.vertical'],
  ['fishbone', 'org.xmind.ui.fishbone.leftHeaded'],
] as const

const book = (layout: LayoutKind) => {
  let document = applyCommand(createDocument('中心'), {
    type: 'addTopic',
    parentId: 'root',
    id: 'branch',
    title: '分支',
  })
  document = applyCommand(document, { type: 'setDocumentSettings', settings: { layout } })
  document = applyCommand(document, {
    type: 'setTopicStructure',
    topicId: 'branch',
    structure: layout,
  })
  return createWorkbook(document)
}
const modern = (rootTopic: unknown, extensions?: unknown) => {
  return zipSync({
    'content.json': strToU8(
      JSON.stringify([
        { id: 'sheet', title: 'Sheet', rootTopic, ...(extensions ? { extensions } : {}) },
      ]),
    ),
  })
}
const content = (bytes: Uint8Array) => {
  return JSON.parse(new TextDecoder().decode(readArchive(bytes).get('content.json'))) as {
    rootTopic: { structureClass: string; children: { attached: { structureClass: string }[] } }
  }[]
}

describe('diagram structure file compatibility', () => {
  it('recognizes the standard balanced map ID as the mind-map family', () => {
    const imported = importXmind(
      modern({
        id: 'root',
        title: '中心',
        structureClass: 'org.xmind.ui.map',
      }),
    )
    expect(imported.workbook.sheets[0]?.document.settings?.layout).toBe('map')
    expect(imported.warnings).toEqual([])
  })
  it.each(LAYOUT_KINDS)(
    'saves and reopens %s whole-sheet and branch structure without changing other sheets',
    (layout) => {
      const original = book(layout)
      const second = createWorkbook(createDocument('第二页')).sheets[0]
      if (!second) throw new Error('Missing sheet')
      const workbook = { ...original, sheets: [...original.sheets, { ...second, id: 'second' }] }
      expect(deserializeWorkbook(serializeWorkbook(workbook))).toEqual(workbook)
      const imported = importXmind(encodeXmind(workbook)).workbook
      expect(imported.sheets[0]?.document.settings?.layout).toBe(layout)
      expect(imported.sheets[0]?.document.topics.branch?.structure).toBe(layout)
      expect(imported.sheets[1]?.document.settings).toBeUndefined()
    },
  )

  it.each(pairs)(
    'imports and exports verified standard %s structures on roots and branches',
    (layout, structureClass) => {
      const encoded = content(encodeXmind(book(layout)))[0]?.rootTopic
      expect(encoded?.structureClass).toBe(structureClass)
      expect(encoded?.children.attached[0]?.structureClass).toBe(structureClass)
      const imported = importXmind(
        modern({
          id: 'root',
          title: '中心',
          structureClass,
          children: { attached: [{ id: 'branch', title: '分支', structureClass }] },
        }),
      )
      const document = imported.workbook.sheets[0]?.document
      expect(document?.settings?.layout).toBe(layout)
      expect(document?.topics.root?.structure).toBeUndefined()
      expect(document?.topics.branch?.structure).toBe(layout)
      expect(imported.warnings).toEqual([])
    },
  )

  it.each([
    ['tree-down', 'org.xmind.ui.org-chart.down'],
    ['tree-up', 'org.xmind.ui.org-chart.up'],
    ['brace-right', 'org.xmind.ui.logic.right'],
    ['brace-left', 'org.xmind.ui.logic.left'],
    ['tree-table-right', 'org.xmind.ui.logic.right'],
    ['tree-table-down', 'org.xmind.ui.org-chart.down'],
    ['matrix', 'org.xmind.ui.logic.right'],
  ] as const)('exports %s with an explicit approximate standard fallback', (layout, expected) => {
    const encoded = content(encodeXmind(book(layout)))[0]?.rootTopic
    expect(encoded?.structureClass).toBe(expected)
    expect(encoded?.children.attached[0]?.structureClass).toBe(expected)
  })

  it('imports legacy XML structures independently for each sheet and mixed branch', () => {
    const xml = `<xmap-content><sheet id="one"><title>一</title>
      <topic id="root" structure-class="org.xmind.ui.org-chart.up"><title>中心</title>
      <children><topics type="attached"><topic id="branch" structure-class="org.xmind.ui.timeline.vertical">
      <title>分支</title></topic></topics></children></topic></sheet>
      <sheet id="two"><title>二</title><topic id="root" structure-class="org.xmind.ui.logic.left">
      <title>另一个中心</title></topic></sheet></xmap-content>`
    const imported = importXmind(zipSync({ 'content.xml': strToU8(xml.replace(/>\s+</g, '><')) }))
    expect(imported.workbook.sheets.map(({ document }) => document.settings?.layout)).toEqual([
      'org-up',
      'logic-left',
    ])
    expect(imported.workbook.sheets[0]?.document.topics.branch?.structure).toBe('timeline-vertical')
    expect(imported.warnings).toEqual([])
  })

  it('keeps exact Brainstorming root and branch extensions authoritative over standard fallback structures', () => {
    const imported = importXmind(
      modern(
        {
          id: 'root',
          title: '中心',
          structureClass: pairs[0][1],
          extensions: [{ provider, content: { structure: 'brace-left' } }],
          children: {
            attached: [
              {
                id: 'branch',
                title: '分支',
                structureClass: pairs[1][1],
                extensions: [{ provider, content: { structure: 'tree-table-down' } }],
              },
            ],
          },
        },
        [{ provider, content: { settings: { layout: 'tree-up' } } }],
      ),
    )
    const document = imported.workbook.sheets[0]?.document
    expect(document?.settings?.layout).toBe('tree-up')
    expect(document?.topics.root?.structure).toBe('brace-left')
    expect(document?.topics.branch?.structure).toBe('tree-table-down')
  })

  it('warns and inherits/defaults unknown standard structures while preserving the complete ordered subtree', () => {
    const imported = importXmind(
      modern({
        id: 'root',
        title: '中心',
        structureClass: 'unknown.structure',
        children: {
          attached: [
            {
              id: 'branch',
              title: '分支',
              structureClass: '__proto__',
              children: { attached: [{ id: 'leaf', title: '保留的后代' }] },
            },
          ],
        },
      }),
    )
    const document = imported.workbook.sheets[0]?.document
    expect(document?.settings).toBeUndefined()
    expect(document?.topics.root?.children).toEqual(['branch'])
    expect(document?.topics.branch?.children).toEqual(['leaf'])
    expect(document?.topics.leaf?.title).toBe('保留的后代')
    expect(document?.topics.branch?.structure).toBeUndefined()
    expect(imported.warnings).toEqual([
      '不支持的 XMind 布局已使用继承或默认布局，主题内容已保留（2 项）',
    ])
  })
})
