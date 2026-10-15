import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  createExampleDocument,
  createFixtureDocument,
  deserializeDocument,
  serializeDocument,
  validateDocument,
} from './index'

describe('versioned document persistence', () => {
  it('round-trips a sample without derived or foreign persisted properties', () => {
    const document = createExampleDocument()
    expect(deserializeDocument(serializeDocument(document))).toEqual(document)
    const withForeignData = JSON.stringify({
      ...document,
      viewport: { x: 1 },
      topics: { ...document.topics, root: { ...document.topics.root, selected: true } },
    })
    expect(deserializeDocument(withForeignData)).toEqual(document)
    expect(serializeDocument({ ...document, viewport: { x: 1 } } as typeof document)).not.toContain(
      'viewport',
    )
  })

  it.each([
    '{invalid',
    JSON.stringify({ ...createDocument(), format: 'vetra' }),
    JSON.stringify({ ...createDocument(), version: 2 }),
    JSON.stringify({ ...createDocument(), rootId: 'missing' }),
    JSON.stringify({ ...createDocument(), topics: [] }),
    JSON.stringify({
      ...createDocument(),
      topics: { root: { id: 'root', title: '中心主题', children: [], side: 'right' } },
    }),
    JSON.stringify({ ...createDocument(), title: 42 }),
  ])('rejects malformed or incompatible input: %s', (json) => {
    expect(() => deserializeDocument(json)).toThrow()
  })

  it('rejects duplicate parents, cycles, unreachable nodes, and invalid inherited directions', () => {
    const document = createFixtureDocument(10)
    const root = document.topics.root
    const first = document.topics['topic-1']
    if (!root || !first) throw new Error('Fixture 缺少主题')
    const invalidDocuments = [
      {
        ...document,
        topics: { ...document.topics, root: { ...root, children: [...root.children, 'topic-1'] } },
      },
      {
        ...document,
        topics: {
          ...document.topics,
          'topic-3': { ...document.topics['topic-3'], children: ['topic-5'] },
        },
      },
      { ...document, topics: { ...document.topics, 'topic-1': { ...first, children: ['root'] } } },
      { ...document, topics: { ...document.topics, root: { ...root, children: [] } } },
      {
        ...document,
        topics: { ...document.topics, 'topic-1': { ...first, children: ['missing'] } },
      },
      { ...document, topics: { ...document.topics, 'topic-1': { ...first, side: 'left' } } },
    ]
    for (const invalid of invalidDocuments)
      expect(() => deserializeDocument(JSON.stringify(invalid))).toThrow()
  })

  it('rejects prototype keys and inherited required fields', () => {
    const document = createDocument()
    const topics = {
      ...document.topics,
      ['__proto__']: { id: '__proto__', title: 'x', children: [], collapsed: false, side: 'right' },
    }
    expect(() => deserializeDocument(JSON.stringify({ ...document, topics }))).toThrow()
    const inherited: unknown = Object.create(document)
    expect(() => {
      validateDocument(inherited)
    }).toThrow()
  })

  it('validates, edits, deletes and round-trips a 5,000-level tree without recursion overflow', () => {
    const document = createFixtureDocument(5_000, 'deep')
    const reopened = deserializeDocument(serializeDocument(document))
    expect(Object.keys(reopened.topics)).toHaveLength(5_000)
    const moved = applyCommand(reopened, {
      type: 'moveTopic',
      topicId: 'topic-2',
      parentId: 'root',
      side: 'left',
    })
    expect(moved.topics['topic-4999']?.side).toBe('left')
    const removed = applyCommand(moved, { type: 'deleteTopic', topicId: 'topic-2' })
    expect(Object.keys(removed.topics)).toEqual(['root', 'topic-1'])
  })
})
