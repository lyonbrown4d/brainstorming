import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  createHistory,
  deserializeDocument,
  executeCommand,
  redo,
  serializeDocument,
  undo,
  validatePresentationStep,
} from '@core'

describe('saved slide arrangements', () => {
  it('persists ordering, layout, hidden pages, reveal and notes and restores them through undo/redo', () => {
    const document = applyCommand(createDocument('演示'), {
      type: 'addTopic',
      id: 'a',
      parentId: 'root',
      title: 'A',
    })
    const before = createHistory(document)
    const steps = [
      {
        topicId: 'a',
        layout: 'image' as const,
        hidden: true,
        reveal: 'items' as const,
        notes: '先介绍背景',
      },
      { topicId: 'root', layout: 'structure' as const },
    ]
    const result = executeCommand(before, { type: 'setPresentation', steps })
    expect(deserializeDocument(serializeDocument(result.document)).presentation).toEqual(steps)
    expect(result.past).toHaveLength(1)
    expect(undo(result).document).toBe(document)
    expect(redo(undo(result)).document.presentation).toEqual(steps)
    expect(applyCommand(result.document, { type: 'setPresentation', steps })).toBe(result.document)
  })

  it('rejects unsupported fields, values, missing topics and oversized notes at the document boundary', () => {
    for (const patch of [
      { layout: 'cinema' },
      { hidden: 1 },
      { reveal: 'zoom' },
      { notes: '长'.repeat(10_001) },
      { privatePath: '/tmp/file' },
    ]) {
      expect(() => {
        validatePresentationStep({ topicId: 'root', ...patch })
      }).toThrow()
    }
    expect(() =>
      applyCommand(createDocument('演示'), {
        type: 'setPresentation',
        steps: [{ topicId: 'missing' }],
      }),
    ).toThrow()
    expect(() => {
      validatePresentationStep({
        topicId: 'root',
        notes: '长'.repeat(10_000),
        hidden: false,
        layout: 'auto',
        reveal: 'all',
      })
    }).not.toThrow()
  })
})
