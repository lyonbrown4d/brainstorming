import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { applyCommand, createDocument, createWorkbook, serializeWorkbook } from '../../src/core'
import type { MindMapWorkbook, Topic } from '../../src/core'
import { readArchive } from '../../src/formats/archive'
import { decodeTrelyx, encodeTrelyx } from '../../src/formats/trelyx'

const manifest = {
  format: 'app.trelyx.document',
  version: 1,
  createdBy: { name: 'Trelyx', version: '0.1.0' },
}

function workbook(): MindMapWorkbook {
  let document = createDocument('中文中心 🌱', 'document-one')
  document = applyCommand(document, {
    type: 'addTopic',
    parentId: 'root',
    id: 'branch',
    title: '多行\n主题',
    side: 'left',
  })
  document = applyCommand(document, {
    type: 'setTopicStyle',
    topicId: 'branch',
    style: {
      fill: '#aabbcc',
      color: '#112233',
      bold: true,
      italic: false,
      shape: 'ellipse',
      fontSize: 22,
      lineWidth: 3,
      lineStyle: 'straight',
    },
  })
  document = applyCommand(document, { type: 'toggleCollapse', topicId: 'branch' })
  return {
    ...createWorkbook(document, '工作簿'),
    sheets: [
      { id: 'sheet-one', name: '规划', document },
      { id: 'sheet-two', name: '第二页', document: createDocument('另一个中心', 'document-two') },
    ],
  }
}

function replaceEntry(bytes: Uint8Array, name: string, value: unknown): Uint8Array {
  const entries = Object.fromEntries(readArchive(bytes))
  entries[name] = strToU8(JSON.stringify(value))
  return zipSync(entries)
}

function deepWorkbook(depth: number): MindMapWorkbook {
  const topics: Record<string, Topic> = {}
  for (let index = 0; index < depth; index++) {
    const id = `topic-${index}`
    topics[id] = {
      id,
      title: '主题',
      side: 'right',
      collapsed: false,
      children: index + 1 < depth ? [`topic-${index + 1}`] : [],
    }
  }
  return createWorkbook({ ...createDocument('主题', 'deep'), rootId: 'topic-0', topics })
}

describe('Trelyx native ZIP document', () => {
  it('roundtrips multiple sheets, independent document IDs, Unicode, ordering and all styles', () => {
    const original = workbook()
    const bytes = encodeTrelyx(original)
    expect(Array.from(bytes.subarray(0, 4))).toEqual([80, 75, 3, 4])
    expect(decodeTrelyx(bytes)).toEqual(original)
    const entries = readArchive(bytes)
    expect(JSON.parse(new TextDecoder().decode(entries.get('manifest.json')))).toEqual(manifest)
    const content: unknown = JSON.parse(new TextDecoder().decode(entries.get('document.json')))
    expect(content).toMatchObject({ id: original.id, title: '工作簿' })
    expect(JSON.stringify(content)).not.toMatch(/"(?:format|version)":/u)
  })

  it('rejects legacy JSON, future native versions and missing required content', () => {
    const bytes = encodeTrelyx(workbook())
    expect(() => decodeTrelyx(strToU8(serializeWorkbook(workbook())))).toThrow(/ZIP/u)
    expect(() =>
      decodeTrelyx(replaceEntry(bytes, 'manifest.json', { ...manifest, version: 2 })),
    ).toThrow(/版本/u)
    expect(() =>
      decodeTrelyx(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) })),
    ).toThrow(/document.json/u)
  })

  it('rejects unsupported attachments and unknown domain fields instead of dropping them', () => {
    const entries = Object.fromEntries(readArchive(encodeTrelyx(workbook())))
    expect(() =>
      decodeTrelyx(zipSync({ ...entries, 'assets/photo.png': new Uint8Array([1]) })),
    ).toThrow(/附加内容/u)
    expect(() =>
      decodeTrelyx(zipSync({ ...entries, 'preview/image.png': new Uint8Array([1]) })),
    ).toThrow(/附加内容/u)
    expect(decodeTrelyx(zipSync({ ...entries, 'assets/': new Uint8Array() }))).toEqual(workbook())
    expect(() =>
      decodeTrelyx(
        replaceEntry(encodeTrelyx(workbook()), 'document.json', {
          id: 'x',
          title: 'x',
          sheets: [],
          notes: 'must preserve',
        }),
      ),
    ).toThrow(/不支持的内容/u)
  })

  it('validates the decoded tree and rejects malformed UTF-8 JSON', () => {
    const entries = Object.fromEntries(readArchive(encodeTrelyx(workbook())))
    expect(() =>
      decodeTrelyx(
        zipSync({ ...entries, 'document.json': strToU8('{"id":"x","title":"x","sheets":[]}') }),
      ),
    ).toThrow(/至少需要一个画布/u)
    expect(() =>
      decodeTrelyx(zipSync({ ...entries, 'document.json': new Uint8Array([0xff]) })),
    ).toThrow(/UTF-8 JSON/u)
  })

  it('accepts depth 128 and rejects depth 129 when saving and opening', () => {
    expect(decodeTrelyx(encodeTrelyx(deepWorkbook(128)))).toEqual(deepWorkbook(128))
    const tooDeep = deepWorkbook(129)
    expect(() => encodeTrelyx(tooDeep)).toThrow(/128 层/u)
    const content = {
      id: tooDeep.id,
      title: tooDeep.title,
      sheets: tooDeep.sheets.map((sheet) => {
        const { id, title, rootId, topics } = sheet.document
        return { id: sheet.id, name: sheet.name, document: { id, title, rootId, topics } }
      }),
    }
    expect(() =>
      decodeTrelyx(replaceEntry(encodeTrelyx(workbook()), 'document.json', content)),
    ).toThrow(/128 层/u)
  })

  it('bounds topic count and serialized entry bytes', () => {
    const base = createDocument('主题', 'wide')
    const topics: Record<string, Topic> = { ...base.topics }
    const children = Array.from({ length: 20_000 }, (_, index) => `topic-${index}`)
    const root = base.topics.root
    if (!root) throw new Error('Test fixture is missing a root')
    topics.root = { ...root, children }
    for (const id of children)
      topics[id] = { id, title: '', side: 'right', collapsed: false, children: [] }
    expect(() => encodeTrelyx(createWorkbook({ ...base, topics }))).toThrow(/20000/u)
    expect(() =>
      encodeTrelyx(createWorkbook(createDocument('大'.repeat(4 * 1024 * 1024), 'large'))),
    ).toThrow(/10 MiB/u)
  })
})
