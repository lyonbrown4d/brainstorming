import { beforeEach, expect, it } from 'vitest'
import { applyCommand, createDocument } from '@core'
import { useEditor } from '@renderer/state/editor'
import { setSelectedTopics } from '@renderer/state/selection'
import {
  applyTopicStyle,
  copyTopicStyle,
  topicStyleTargets,
  useCopiedTopicStyle,
} from '@renderer/state/topicStyleActions'

beforeEach(() => {
  let document = createDocument('Style')
  for (const [topicId, parentId] of [
    ['a', 'root'],
    ['b', 'root'],
    ['a1', 'a'],
    ['b1', 'b'],
  ]) {
    if (!topicId || !parentId) throw new Error('Invalid fixture')
    document = applyCommand(document, { type: 'addTopic', parentId, id: topicId, title: topicId })
  }
  document = applyCommand(document, {
    type: 'setTopicStyle',
    topicId: 'a1',
    style: {
      fill: '#123456',
      shape: 'ellipse',
      offsetX: 40,
      spatialDepth: 12,
    },
  })
  document = applyCommand(document, {
    type: 'setTopicStyle',
    topicId: 'b1',
    style: {
      fill: '#abcdef',
      offsetY: -20,
      spatialDepth: -4,
      italic: true,
      width: 240,
    },
  })
  useEditor.getState().replace(document)
  useEditor.setState({ busy: false })
  setSelectedTopics(['a1'])
  useCopiedTopicStyle.setState({ style: null })
})

it('copies visual style across selections without copying position and undoes one batch', () => {
  copyTopicStyle()
  setSelectedTopics(['b', 'b1'])
  const before = useEditor.getState().history.document
  const historyLength = useEditor.getState().history.past.length
  expect(applyTopicStyle('selection')).toBe(true)
  const after = useEditor.getState()
  expect(after.history.past).toHaveLength(historyLength + 1)
  expect(after.history.document.topics.b?.style).toMatchObject({
    fill: '#123456',
    shape: 'ellipse',
  })
  expect(after.history.document.topics.b?.style?.offsetX).toBeUndefined()
  expect(after.history.document.topics.b1?.style).toMatchObject({
    fill: '#123456',
    offsetY: -20,
    spatialDepth: -4,
    italic: false,
  })
  expect(after.history.document.topics.b1?.style?.width).toBeUndefined()
  after.undo()
  expect(useEditor.getState().history.document).toEqual(before)
})

it('counts all topics at the same depth and applies current style to descendants in one undo', () => {
  const document = useEditor.getState().history.document
  expect(topicStyleTargets(document, 'a1', 'level')).toEqual(['b1'])
  expect(topicStyleTargets(document, 'root', 'descendants')).toEqual(['a', 'a1', 'b', 'b1'])
  expect(topicStyleTargets(document, 'missing', 'level')).toEqual([])
  expect(applyTopicStyle('level')).toBe(true)
  expect(useEditor.getState().history.document.topics.b1?.style?.fill).toBe('#123456')
  setSelectedTopics(['root'])
  const before = useEditor.getState().history.document
  expect(applyTopicStyle('descendants')).toBe(true)
  useEditor.getState().undo()
  expect(useEditor.getState().history.document).toEqual(before)
})

it('does not paste without a copied style or mutate while busy', () => {
  const before = useEditor.getState().history
  expect(applyTopicStyle('selection')).toBe(false)
  useEditor.setState({ busy: true })
  copyTopicStyle()
  expect(useCopiedTopicStyle.getState().style).toBeNull()
  expect(applyTopicStyle('descendants')).toBe(false)
  expect(useEditor.getState().history).toBe(before)
})
