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
  TOPIC_SHAPES,
} from '@core'
import type { TopicStyle } from '@core'

describe('topic presentation commands', () => {
  it('replaces approved style fields atomically, isolates caller data and supports undo/redo', () => {
    const original = createHistory(createDocument('中心', 'styled'))
    const style = { fill: '#aabbcc', fontSize: 24, bold: true, width: 360, spatialDepth: 125 }
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
        style: { bold: true, fontSize: 24, fill: '#aabbcc', width: 360, spatialDepth: 125 },
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
      width: 1200,
      scale: 2.5,
      spatialDepth: -1_000_000,
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

  it('removes only manual width when fitting and restores it with undo', () => {
    const original = createHistory(createDocument('中心', 'width-fit'))
    const resized = executeCommand(original, {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { fill: '#abcdef', width: 320 },
    })
    const fitted = executeCommand(resized, {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { fill: '#abcdef' },
    })
    expect(fitted.document.topics.root?.style).toEqual({ fill: '#abcdef' })
    expect(undo(fitted).document.topics.root?.style).toEqual({ fill: '#abcdef', width: 320 })
  })

  it.each(TOPIC_SHAPES)(
    'switches to %s in one undo step without changing content or descendants',
    (shape) => {
      let document = applyCommand(createDocument('原有标题', 'appearance'), {
        type: 'addTopic',
        parentId: 'root',
        id: 'child',
        title: '保留子主题',
      })
      document = applyCommand(document, {
        type: 'setTopicNotes',
        topicId: 'root',
        notes: '完整备注\n第二行',
      })
      document = applyCommand(document, {
        type: 'addTopicAttachment',
        topicId: 'root',
        asset: {
          id: 'file',
          name: 'notes.txt',
          mimeType: 'text/plain',
          data: 'dGVzdA==',
        },
      })
      document = applyCommand(document, {
        type: 'setTopicImage',
        topicId: 'root',
        width: 60,
        height: 40,
        asset: {
          id: 'image',
          name: 'image.png',
          mimeType: 'image/png',
          data: 'AA==',
        },
      })
      const original = createHistory(document)
      const next = executeCommand(original, {
        type: 'setTopicStyle',
        topicId: 'root',
        style: { shape },
      })
      expect(next.past).toEqual([document])
      expect(next.document.topics.root).toEqual({ ...document.topics.root, style: { shape } })
      expect(next.document.topics.child).toBe(document.topics.child)
      expect(next.document.assets).toEqual(document.assets)
      expect(deserializeDocument(serializeDocument(next.document))).toEqual(next.document)
      expect(undo(next).document).toBe(document)
      expect(redo(undo(next)).document).toBe(next.document)
    },
  )

  it.each([
    null,
    [],
    { fill: '#abc' },
    { color: 'red' },
    { fontSize: 11 },
    { fontSize: 33 },
    { fontSize: Number.NaN },
    { width: 79 },
    { width: 1201 },
    { width: Number.NaN },
    { width: Number.POSITIVE_INFINITY },
    { width: '200' },
    { scale: 0.49 },
    { scale: 3.01 },
    { scale: Number.NaN },
    { spatialDepth: -1_000_000.1 },
    { spatialDepth: 1_000_000.1 },
    { spatialDepth: Number.NaN },
    { spatialDepth: Number.POSITIVE_INFINITY },
    { spatialDepth: '125' },
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
