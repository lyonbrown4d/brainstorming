import { readFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { validateWorkbook } from '@core'
import { importXmind } from '@formats/xmind'
import { decodeBrainstorming, encodeBrainstorming } from '@formats/brainstorming'

const fixture = (name: string): Uint8Array =>
  readFileSync(new URL(`../fixtures/xmind/${name}`, import.meta.url))
const archive = (value: unknown): Uint8Array =>
  zipSync({ 'content.json': strToU8(JSON.stringify(value)) })
const sheet = (rootTopic: unknown): unknown[] => [{ id: 'sheet', title: 'Sheet', rootTopic }]

describe('XMind import', () => {
  it('imports an unmodified official XMind sample using modern content over warning-only XML', () => {
    const { workbook, warnings } = importXmind(fixture('official-viewer-test-1.xmind'))
    expect(workbook.sheets).toHaveLength(1)
    expect(workbook.sheets[0]?.name).toBe('Map 1')
    const document = workbook.sheets[0]?.document
    expect(document?.title).toBe('test-1.xmind')
    const children = document?.topics[document.rootId]?.children ?? []
    expect(children.map((id) => document?.topics[id]?.title)).toEqual([
      'Main Topic 1',
      'Main Topic 2',
      'Main Topic 3',
    ])
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('主题配色')]))
    expect(decodeBrainstorming(encodeBrainstorming(workbook))).toEqual(workbook)
  })

  it('preserves modern sheet order, titles, ordered subtrees, collapse and explicit styles', () => {
    const result = importXmind(zipSync({ 'content.json': fixture('modern.json') }))
    expect(() => {
      validateWorkbook(result.workbook)
    }).not.toThrow()
    expect(result.workbook.sheets.map(({ name }) => name)).toEqual(['中文计划', '第二页'])
    const document = result.workbook.sheets[0]?.document
    expect(document?.title).toBe('中心主题\n第二行')
    expect(document?.settings?.layout).toBe('logic-right')
    expect(document?.topics.root?.children.slice(0, 2)).toEqual(['first', 'second'])
    expect(document?.topics.first).toMatchObject({
      title: '第一条',
      collapsed: true,
      children: ['nested'],
    })
    expect(document?.topics.second?.title).toBe('Second\nline')
    expect(document?.topics.first?.notes).toBe('暂不支持的备注')
    expect(document?.topics.root?.style).toEqual({
      fill: '#abcdef',
      color: '#123456',
      fontSize: 20,
      bold: true,
      italic: true,
      shape: 'ellipse',
    })
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('样式'),
        '未导入 XMind 图标（2 项）',
        '未导入 XMind 关联线（1 项）',
        expect.stringContaining('图片不是有效的内嵌资源'),
        '未导入 XMind 概要范围（1 项）',
      ]),
    )
  })

  it('keeps detached and summary text in named branches and reports semantic adjustments', () => {
    const { workbook, warnings } = importXmind(zipSync({ 'content.json': fixture('modern.json') }))
    const topics = workbook.sheets[0]?.document.topics ?? {}
    const group = Object.values(topics).find(({ title }) => title === '导入的游离主题')
    expect(group?.children).toEqual(['floating'])
    expect(topics.floating?.children).toEqual(['floating-child'])
    expect(topics['floating-child']?.title).toBe('游离主题后代')
    expect(topics.summary?.title).toBe('概要正文')
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('游离主题已保留'),
        expect.stringContaining('概要主题已保留'),
      ]),
    )
  })

  it('reads legacy namespaces, referenced styles, entities, folding and multiple sheets', () => {
    const { workbook, warnings } = importXmind(
      zipSync({
        'content.xml': fixture('legacy.xml'),
        'styles.xml': fixture('styles.xml'),
      }),
    )
    expect(workbook.sheets.map(({ name }) => name)).toEqual(['旧版画布', '旧版第二页'])
    const document = workbook.sheets[0]?.document
    expect(document?.title).toBe('中文旧版\n多行标题')
    expect(document?.topics['legacy-root']?.children.slice(0, 2)).toEqual(['legacy-a', 'legacy-c'])
    expect(document?.topics['legacy-a']).toMatchObject({
      title: '甲 & 乙',
      collapsed: true,
      children: ['legacy-b'],
    })
    expect(document?.topics['legacy-root']?.style).toEqual({
      fill: '#fedcba',
      color: '#112233',
      fontSize: 18,
      bold: true,
      italic: true,
      shape: 'rounded',
    })
    expect(document?.topics['legacy-d']?.title).toBe('旧版游离主题')
    expect(document?.topics['legacy-c']?.notes).toBe('备注')
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('游离')]))
  })

  it('prefers modern content and refuses invalid modern content instead of using stale XML', () => {
    const xml = fixture('legacy.xml')
    const valid = importXmind(
      zipSync({
        'content.xml': xml,
        'content.json': archiveContent(sheet({ id: 'modern', title: 'Modern' })),
      }),
    )
    expect(valid.workbook.sheets[0]?.document.title).toBe('Modern')
    expect(() =>
      importXmind(zipSync({ 'content.xml': xml, 'content.json': strToU8('{bad') })),
    ).toThrow(/content.json/)
  })

  it('normalizes duplicate, missing and reserved IDs deterministically without losing topics', () => {
    const input = archive(
      sheet({
        id: '__proto__',
        title: 'Root',
        children: {
          attached: [
            { id: 'same', title: 'A' },
            { id: 'same', title: 'B' },
            { title: 'C' },
            { id: 'constructor', title: 'D' },
          ],
        },
      }),
    )
    const result = importXmind(input)
    expect(importXmind(input)).toEqual(result)
    const topics = result.workbook.sheets[0]?.document.topics ?? {}
    expect(Object.values(topics).map(({ title }) => title)).toEqual(['Root', 'A', 'B', 'C', 'D'])
    expect(Object.hasOwn(topics, '__proto__')).toBe(false)
    expect(result.warnings).toEqual([expect.stringContaining('ID 已重新生成')])
    const collision = importXmind(
      archive(
        sheet({
          title: 'Generated root',
          children: { attached: [{ id: 'xmind-topic-1-1', title: 'Valid ID' }] },
        }),
      ),
    )
    expect(collision.workbook.sheets[0]?.document.topics['xmind-topic-1-1']?.title).toBe('Valid ID')
  })

  it('rejects missing content, invalid structures, malformed XML and entity declarations', () => {
    expect(() => importXmind(zipSync({ 'metadata.json': strToU8('{}') }))).toThrow(/缺少/)
    for (const data of [
      [],
      {},
      sheet({ title: 5 }),
      sheet({ title: 'x', children: { attached: {} } }),
      sheet(null),
    ])
      expect(() => importXmind(archive(data))).toThrow()
    for (const xml of [
      '<xmap-content><sheet></xmap-content>',
      '<!DOCTYPE x [<!ENTITY a "secret">]><xmap-content/>',
      '<xmap-content><sheet><title>&undeclared;</title></sheet></xmap-content>',
      '<xmap-content><sheet><title>&#x110000;</title></sheet></xmap-content>',
      '<xmap-content/><xmap-content/>',
    ])
      expect(() => importXmind(zipSync({ 'content.xml': strToU8(xml) }))).toThrow(/xml|XML|DOCTYPE/)
  })

  it('bounds depth, sheet count and total topic count before producing a workbook', () => {
    let root: unknown = { title: 'Leaf' }
    for (let index = 0; index < 127; index++)
      root = { title: 'Nested', children: { attached: [root] } }
    expect(() => importXmind(archive(sheet(root)))).not.toThrow()
    root = { title: 'Overflow', children: { attached: [root] } }
    expect(() => importXmind(archive(sheet(root)))).toThrow(/128/)
    expect(() =>
      importXmind(archive(Array.from({ length: 129 }, () => sheet({ title: 'x' })[0]))),
    ).toThrow(/128/)
    expect(() =>
      importXmind(
        archive(
          sheet({
            title: 'Root',
            children: {
              attached: Array.from({ length: 20_000 }, (_, index) => ({
                id: `child-${index}`,
                title: '',
              })),
            },
          }),
        ),
      ),
    ).toThrow(/20000/)
  })
})

const archiveContent = (value: unknown): Uint8Array => {
  return strToU8(JSON.stringify(value))
}
