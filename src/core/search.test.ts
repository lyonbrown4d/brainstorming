import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  createHistory,
  createWorkbook,
  executeCommand,
  MAX_TOPIC_NOTES_LENGTH,
  searchDocument,
  searchWorkbook,
  undo,
} from '@core'

const fixture = () => {
  return applyCommand(createDocument('Search 搜索', 'search'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'a', title: 'Cat cat scatter cat.' },
      { type: 'addTopic', parentId: 'a', id: 'hidden', title: '中文 中文化 中文' },
      { type: 'setTopicNotes', topicId: 'hidden', notes: 'Cat notes $& [a.b]' },
      { type: 'toggleCollapse', topicId: 'a' },
    ],
  })
}

describe('literal document search and replacement', () => {
  it('searches titles and optional notes in stable order, including collapsed descendants', () => {
    const document = fixture()
    expect(searchDocument(document, '中文')).toEqual([
      { topicId: 'hidden', field: 'title', text: '中文 中文化 中文', count: 3 },
    ])
    expect(searchDocument(document, 'cat')).toEqual([
      { topicId: 'a', field: 'title', text: 'Cat cat scatter cat.', count: 4 },
    ])
    expect(searchDocument(document, 'cat', { matchCase: true, wholeWord: true })[0]?.count).toBe(2)
    expect(searchDocument(document, 'cat', { wholeWord: true })[0]?.count).toBe(3)
    expect(
      searchDocument(document, 'cat', { includeNotes: true }).map(({ topicId, field }) => ({
        topicId,
        field,
      })),
    ).toEqual([
      { topicId: 'a', field: 'title' },
      { topicId: 'hidden', field: 'notes' },
    ])
    expect(searchDocument(document, '')).toEqual([])
  })

  it('uses literal metacharacters, Unicode words and combining characters', () => {
    const document = applyCommand(fixture(), {
      type: 'renameTopic',
      topicId: 'hidden',
      title: 'é é élève 中文 中文化 中文',
    })
    expect(searchDocument(document, '[a.b]', { includeNotes: true })[0]?.field).toBe('notes')
    expect(searchDocument(document, '.*', { includeNotes: true })).toEqual([])
    expect(searchDocument(document, '中文', { wholeWord: true })[0]?.count).toBe(2)
    expect(searchDocument(document, 'é', { wholeWord: true })[0]?.count).toBe(1)
    expect(searchDocument(document, 'é', { wholeWord: true })[0]?.count).toBe(1)
  })

  it('searches all sheets or an explicit sheet without conflating shared topic IDs', () => {
    const first = createWorkbook(fixture())
    const workbook = {
      ...first,
      sheets: [...first.sheets, { id: 'other', name: 'Other', document: fixture() }],
    }
    const matches = searchWorkbook(workbook, 'cat', { includeNotes: true })
    expect(matches.map(({ sheetId, topicId }) => [sheetId, topicId])).toEqual([
      ['search', 'a'],
      ['search', 'hidden'],
      ['other', 'a'],
      ['other', 'hidden'],
    ])
    expect(
      searchWorkbook(workbook, 'cat', { sheetId: 'other' }).map((match) => match.sheetId),
    ).toEqual(['other'])
    expect(searchWorkbook(workbook, 'cat', { sheetId: 'missing' })).toEqual([])
  })

  it('replaces literal text and replacement tokens without regex expansion in a single history step', () => {
    const initial = createHistory(fixture())
    const changed = executeCommand(initial, {
      type: 'batch',
      commands: [
        { type: 'replaceTopicText', topicId: 'root', query: '搜索', replacement: '$& $1' },
        {
          type: 'replaceTopicText',
          topicId: 'hidden',
          query: '[a.b]',
          replacement: '$& $1',
          includeNotes: true,
        },
      ],
    })
    expect(changed.document.title).toBe('Search $& $1')
    expect(changed.document.topics.hidden?.notes).toBe('Cat notes $& $& $1')
    expect(changed.past).toHaveLength(1)
    expect(undo(changed).document).toBe(initial.document)
  })

  it('applies field-specific replacement and whole-word matching consistently', () => {
    const source = applyCommand(fixture(), {
      type: 'renameTopic',
      topicId: 'hidden',
      title: 'Cat scatter cat',
    })
    const notesOnly = applyCommand(source, {
      type: 'replaceTopicText',
      topicId: 'hidden',
      query: 'cat',
      replacement: 'dog',
      field: 'notes',
    })
    expect(notesOnly.topics.hidden?.title).toBe('Cat scatter cat')
    expect(notesOnly.topics.hidden?.notes).toBe('dog notes $& [a.b]')
    const titleOnly = applyCommand(source, {
      type: 'replaceTopicText',
      topicId: 'hidden',
      query: 'cat',
      replacement: 'dog',
      field: 'title',
      includeNotes: true,
      wholeWord: true,
    })
    expect(titleOnly.topics.hidden?.title).toBe('dog scatter dog')
    expect(titleOnly.topics.hidden?.notes).toBe(source.topics.hidden?.notes)
    expect(
      applyCommand(source, {
        type: 'replaceTopicText',
        topicId: 'hidden',
        query: 'missing',
        replacement: 'dog',
      }),
    ).toBe(source)
  })

  it('rejects empty queries and oversized notes atomically, including within a batch', () => {
    const source = applyCommand(fixture(), {
      type: 'setTopicNotes',
      topicId: 'hidden',
      notes: 'a'.repeat(MAX_TOPIC_NOTES_LENGTH),
    })
    const original = JSON.stringify(source)
    expect(() =>
      applyCommand(source, {
        type: 'replaceTopicText',
        topicId: 'hidden',
        query: '',
        replacement: 'x',
      }),
    ).toThrow(/不能为空/)
    expect(() =>
      applyCommand(source, {
        type: 'batch',
        commands: [
          { type: 'renameTopic', topicId: 'root', title: 'Changed' },
          {
            type: 'replaceTopicText',
            topicId: 'hidden',
            query: 'a',
            replacement: 'aa',
            includeNotes: true,
          },
        ],
      }),
    ).toThrow(/100000/)
    expect(JSON.stringify(source)).toBe(original)
  })
})
