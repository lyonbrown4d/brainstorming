import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  applyWorkbookCommand,
  createDocument,
  createWorkbook,
  deserializeWorkbook,
  serializeDocument,
  serializeWorkbook,
  validateWorkbook,
} from './index'
import type { MindMapSheet, WorkbookCommand } from './index'

function secondSheet(): MindMapSheet {
  return { id: 'second', name: '第二页', document: createDocument('第二页中心', 'second') }
}

describe('versioned workbook persistence', () => {
  it('round-trips ordered sheets and all styles without transient state', () => {
    const document = applyCommand(createDocument('中心', 'first'), {
      type: 'setTopicStyle',
      topicId: 'root',
      style: {
        fill: '#ffeedd',
        color: '#123456',
        fontSize: 20,
        bold: true,
        italic: false,
        shape: 'rectangle',
        lineStyle: 'curve',
        lineWidth: 2,
      },
    })
    const workbook = applyWorkbookCommand(createWorkbook(document, '工作簿标题'), {
      type: 'addSheet',
      sheet: secondSheet(),
    })
    expect(deserializeWorkbook(serializeWorkbook(workbook))).toEqual(workbook)
    const json = JSON.stringify({
      ...workbook,
      activeSheetId: 'second',
      history: [],
      sheets: workbook.sheets.map((sheet) => ({
        ...sheet,
        viewport: { x: 100 },
        selection: ['root'],
      })),
    })
    expect(deserializeWorkbook(json)).toEqual(workbook)
    expect(
      serializeWorkbook({ ...workbook, activeSheetId: 'second' } as typeof workbook),
    ).not.toContain('activeSheetId')
  })

  it('migrates v1 trees and retains every document detail', () => {
    const document = applyCommand(createDocument('旧导图', 'legacy-map'), {
      type: 'addTopic',
      parentId: 'root',
      id: 'branch',
      title: '原有分支',
      side: 'left',
    })
    const workbook = deserializeWorkbook(serializeDocument(document))
    expect(workbook).toEqual({
      format: 'trelyx',
      version: 2,
      id: 'legacy-map',
      title: '旧导图',
      sheets: [{ id: 'legacy-map', name: '旧导图', document }],
    })
    expect(createWorkbook(createDocument('', 'untitled')).sheets[0]?.name).toBe('画布 1')
    const long = '长'.repeat(100)
    expect(createWorkbook(createDocument(long, 'long')).sheets[0]?.name).toHaveLength(80)
    expect(createWorkbook(createDocument(long, 'long')).title).toBe(long)
    const emojiTitle = '👩‍💻'.repeat(81)
    expect(createWorkbook(createDocument(emojiTitle, 'emoji')).sheets[0]?.name).toBe(
      '👩‍💻'.repeat(80),
    )
  })

  it.each([
    '{bad',
    JSON.stringify({ ...createWorkbook(createDocument('中心', 'first')), version: 3 }),
    JSON.stringify({ ...createWorkbook(createDocument('中心', 'first')), sheets: [] }),
    JSON.stringify({ ...createWorkbook(createDocument('中心', 'first')), id: '__proto__' }),
    JSON.stringify({
      ...createWorkbook(createDocument('中心', 'first')),
      sheets: [secondSheet(), secondSheet()],
    }),
    JSON.stringify({
      ...createWorkbook(createDocument('中心', 'first')),
      sheets: [{ ...secondSheet(), name: '  ' }],
    }),
    JSON.stringify({
      ...createWorkbook(createDocument('中心', 'first')),
      sheets: [{ ...secondSheet(), name: '长'.repeat(81) }],
    }),
    JSON.stringify({
      ...createWorkbook(createDocument('中心', 'first')),
      sheets: [{ ...secondSheet(), id: 'constructor' }],
    }),
    JSON.stringify({
      ...createWorkbook(createDocument('中心', 'first')),
      sheets: [{ ...secondSheet(), document: { ...secondSheet().document, rootId: 'missing' } }],
    }),
  ])('rejects incompatible or invalid workbook schema: %s', (json) => {
    expect(() => deserializeWorkbook(json)).toThrow()
  })
})

describe('immutable workbook commands', () => {
  it('adds, reorders, renames, updates and deletes sheets while keeping workbook title independent', () => {
    const original = createWorkbook(createDocument('第一页', 'first'), '独立标题')
    let workbook = applyWorkbookCommand(original, {
      type: 'addSheet',
      sheet: secondSheet(),
      index: 0,
    })
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(['second', 'first'])
    workbook = applyWorkbookCommand(workbook, { type: 'moveSheet', sheetId: 'second', index: 1 })
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(['first', 'second'])
    workbook = applyWorkbookCommand(workbook, {
      type: 'renameSheet',
      sheetId: 'first',
      name: '新页名',
    })
    const first = original.sheets[0]
    if (!first) throw new Error('Fixture 缺少画布')
    const document = applyCommand(first.document, {
      type: 'renameTopic',
      topicId: 'root',
      title: '新中心标题',
    })
    workbook = applyWorkbookCommand(workbook, { type: 'updateSheet', sheetId: 'first', document })
    expect(workbook.title).toBe('独立标题')
    expect(workbook.sheets[0]).toMatchObject({ name: '新页名', document: { title: '新中心标题' } })
    workbook = applyWorkbookCommand(workbook, { type: 'deleteSheet', sheetId: 'second' })
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(['first'])
    expect(original.sheets[0]?.name).toBe('第一页')
    expect(original.sheets[0]?.document.title).toBe('第一页')
    validateWorkbook(workbook)
  })

  it('duplicates the complete tree independently with bounded name and a fresh document ID', () => {
    const document = applyCommand(createDocument('长'.repeat(80), 'first'), {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { bold: true },
    })
    const original = createWorkbook(document)
    const duplicated = applyWorkbookCommand(original, {
      type: 'duplicateSheet',
      sheetId: 'first',
      id: 'copy',
    })
    const source = duplicated.sheets[0]
    const copy = duplicated.sheets[1]
    if (!source || !copy) throw new Error('Fixture 缺少复制画布')
    expect(copy.id).toBe('copy')
    expect(copy.document.id).toBe('copy')
    expect(copy.name).toHaveLength(80)
    expect(copy.name.endsWith(' 副本')).toBe(true)
    expect(copy.document.topics).toEqual(source.document.topics)
    expect(copy.document.topics.root).not.toBe(source.document.topics.root)
    expect(copy.document.topics.root?.children).not.toBe(source.document.topics.root?.children)
    expect(copy.document.topics.root?.style).not.toBe(source.document.topics.root?.style)
    const edited = applyWorkbookCommand(duplicated, {
      type: 'updateSheet',
      sheetId: 'copy',
      document: applyCommand(copy.document, {
        type: 'renameTopic',
        topicId: 'root',
        title: '副本中心',
      }),
    })
    expect(edited.sheets[0]?.document.title).toBe(document.title)
    expect(edited.sheets[1]?.document.title).toBe('副本中心')
  })

  it.each<WorkbookCommand>([
    { type: 'deleteSheet', sheetId: 'first' },
    { type: 'renameSheet', sheetId: 'missing', name: '名称' },
    { type: 'renameSheet', sheetId: 'first', name: '' },
    { type: 'renameSheet', sheetId: 'first', name: '长'.repeat(81) },
    { type: 'moveSheet', sheetId: 'first', index: 1 },
    { type: 'moveSheet', sheetId: 'first', index: -1 },
    { type: 'moveSheet', sheetId: 'first', index: 0.5 },
    { type: 'duplicateSheet', sheetId: 'first', id: 'first' },
    { type: 'duplicateSheet', sheetId: 'first', id: '__proto__' },
    { type: 'addSheet', sheet: { ...secondSheet(), id: 'first' } },
    { type: 'addSheet', sheet: secondSheet(), index: 2 },
    {
      type: 'updateSheet',
      sheetId: 'first',
      document: { ...secondSheet().document, rootId: 'missing' },
    },
  ])('rejects invalid commands atomically: %j', (command) => {
    const workbook = createWorkbook(createDocument('中心', 'first'))
    const before = serializeWorkbook(workbook)
    expect(() => applyWorkbookCommand(workbook, command)).toThrow()
    expect(serializeWorkbook(workbook)).toBe(before)
  })
})
