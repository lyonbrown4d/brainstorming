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
} from './index'
import type { TopicStyle } from './index'

describe('topic presentation commands', () => {
  it('replaces approved style fields atomically, isolates caller data and supports undo/redo', () => {
    const original = createHistory(createDocument('中心', 'styled'))
    const style = { fill: '#aabbcc', fontSize: 24, bold: true }
    const styled = executeCommand(original, { type: 'setTopicStyle', topicId: 'root', style })
    expect(styled.past).toEqual([original.document])
    expect(styled.document.topics.root?.style).toEqual(style)
    style.fill = '#000000'
    expect(styled.document.topics.root?.style?.fill).toBe('#aabbcc')
    expect(undo(styled).document).toBe(original.document)
    expect(redo(undo(styled)).document).toBe(styled.document)
    expect(
      executeCommand(styled, {
        type: 'setTopicStyle',
        topicId: 'root',
        style: { bold: true, fontSize: 24, fill: '#aabbcc' },
      }),
    ).toBe(styled)
    const cleared = applyCommand(styled.document, {
      type: 'setTopicStyle',
      topicId: 'root',
      style: {},
    })
    expect(cleared.topics.root?.style).toEqual({})
    expect(original.document.topics.root?.style).toBeUndefined()
  })

  it('round-trips every style field and strips unapproved CSS and renderer state', () => {
    const document = createDocument('中心', 'style-persistence')
    const style: TopicStyle = {
      fill: '#123ABC',
      color: '#ffffff',
      fontSize: 32,
      bold: false,
      italic: true,
      shape: 'ellipse',
      lineStyle: 'straight',
      lineWidth: 6,
    }
    const styled = applyCommand(document, { type: 'setTopicStyle', topicId: 'root', style })
    expect(deserializeDocument(serializeDocument(styled))).toEqual(styled)
    const parsed = deserializeDocument(
      JSON.stringify({
        ...styled,
        topics: { root: { ...styled.topics.root, style: { ...style, position: 'fixed' } } },
      }),
    )
    expect(parsed.topics.root?.style).toEqual(style)
  })

  it.each([
    null,
    [],
    { fill: '#abc' },
    { color: 'red' },
    { fontSize: 11 },
    { fontSize: 33 },
    { fontSize: Number.NaN },
    { lineWidth: 0 },
    { lineWidth: 7 },
    { bold: 1 },
    { italic: 'true' },
    { shape: 'triangle' },
    { lineStyle: 'dotted' },
    { fill: undefined },
  ])('rejects invalid style before changing history: %j', (style) => {
    const original = createHistory(createDocument('中心', 'style-invalid'))
    expect(() =>
      executeCommand(original, {
        type: 'setTopicStyle',
        topicId: 'root',
        style: style as TopicStyle,
      }),
    ).toThrow()
    expect(original.past).toEqual([])
    expect(original.document.topics.root?.style).toBeUndefined()
    if (style !== null && !Object.hasOwn(style, 'fill')) {
      expect(() =>
        deserializeDocument(
          JSON.stringify({
            ...original.document,
            topics: { root: { ...original.document.topics.root, style } },
          }),
        ),
      ).toThrow()
    }
  })
})
