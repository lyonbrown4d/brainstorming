import { withPlainTitle } from '@core/extension-data'
import { applyExtensionCommand, isExtensionCommand } from '@core/extension-commands'
import { clearFloatingRoots } from '@core/extension-references'
import { requireTopic } from '@core/tree'
import type { Command, MindMapDocument } from '@core/types'
import { assertId, validateDocument } from '@core/validation'
import { normalizeTopicStyle, validateTopicStyle } from '@core/topic-style'
import { applyTopicContentCommand } from '@core/content-commands'
import {
  assertNonRoot,
  assertSide,
  branchSide,
  deleteTopics,
  insertionIndex,
  moveTopics,
  updateSide,
} from '@core/selection-commands'
import { pasteTopics } from '@core/clipboard'
import { replaceTopicText } from '@core/search'
import { insertParentTopic, removeTopicOnly } from '@core/structural-commands'
import { sanitizeSummaryLinks } from '@core/summary'

const add = (
  document: MindMapDocument,
  command: Extract<Command, { type: 'addTopic' }>,
): MindMapDocument => {
  assertId(command.id)
  if (Object.hasOwn(document.topics, command.id)) throw new Error(`主题 ${command.id} 已存在`)
  if (typeof command.title !== 'string') throw new Error('标题必须是文本')
  const parent = requireTopic(document, command.parentId)
  const children = [...parent.children]
  children.splice(insertionIndex(command.index, children.length), 0, command.id)
  const side = branchSide(document, parent, command.side)
  return {
    ...document,
    topics: {
      ...document.topics,
      [parent.id]: { ...parent, children, collapsed: false },
      [command.id]: { id: command.id, title: command.title, children: [], collapsed: false, side },
    },
  }
}

/** All document edits pass through this atomic, immutable command boundary. */
const applySingleCommand = (
  document: MindMapDocument,
  command: Exclude<Command, { type: 'batch' }>,
): MindMapDocument => {
  if (isExtensionCommand(command)) return applyExtensionCommand(document, command)
  if (command.type === 'deleteTopics') return deleteTopics(document, command.topicIds)
  if (command.type === 'moveTopics')
    return clearFloatingRoots(moveTopics(document, command), command.topicIds)
  if (command.type === 'pasteTopics') return pasteTopics(document, command)
  if (command.type === 'addTopic') return add(document, command)
  if (command.type === 'insertParentTopic') return insertParentTopic(document, command)
  if (command.type === 'removeTopicOnly') return removeTopicOnly(document, command.topicId)
  const topic = requireTopic(document, command.topicId)
  switch (command.type) {
    case 'setTopicNotes':
    case 'setTopicImage':
    case 'removeTopicImage':
    case 'addTopicAttachment':
    case 'removeTopicAttachment':
      return applyTopicContentCommand(document, topic, command)
    case 'replaceTopicText':
      return replaceTopicText(document, topic, command)
    case 'setTopicStyle': {
      validateTopicStyle(command.style)
      const style = normalizeTopicStyle(command.style)
      if (JSON.stringify(style) === JSON.stringify(normalizeTopicStyle(topic.style ?? {})))
        return document
      return { ...document, topics: { ...document.topics, [topic.id]: { ...topic, style } } }
    }
    case 'renameTopic': {
      if (typeof command.title !== 'string') throw new Error('标题必须是文本')
      if (topic.title === command.title) return document
      return {
        ...document,
        title: topic.id === document.rootId ? command.title : document.title,
        topics: { ...document.topics, [topic.id]: withPlainTitle(topic, command.title) },
      }
    }
    case 'deleteTopic':
      return deleteTopics(document, [topic.id])
    case 'moveTopic':
      return clearFloatingRoots(
        moveTopics(document, { ...command, type: 'moveTopics', topicIds: [topic.id] }),
        [topic.id],
      )
    case 'toggleCollapse':
      return {
        ...document,
        topics: { ...document.topics, [topic.id]: { ...topic, collapsed: !topic.collapsed } },
      }
    case 'setSide': {
      const parentId = assertNonRoot(document, topic.id)
      if (parentId !== document.rootId) throw new Error('请对一级分支修改方向')
      assertSide(command.side)
      if (topic.side === command.side) return document
      const topics = { ...document.topics }
      updateSide(document, topics, topic.id, command.side)
      return { ...document, topics }
    }
    default:
      throw new Error('不支持的主题命令')
  }
}

const assertBatchCommands = (value: unknown): void => {
  if (!Array.isArray(value)) throw new Error('批量命令列表无效')
}

/** One command, including a nested batch, commits exactly one immutable snapshot. */
export const applyCommand = (document: MindMapDocument, command: Command): MindMapDocument => {
  validateDocument(document)
  const pending = [{ command, depth: 0 }]
  let result = document
  let count = 0
  while (pending.length > 0) {
    const next = pending.pop()
    if (!next) break
    count += 1
    if (count > 10_000 || next.depth > 32) throw new Error('批量命令超过数量或嵌套限制')
    if (next.command.type === 'batch') {
      assertBatchCommands(next.command.commands)
      if (next.command.commands.length + pending.length + count > 10_000)
        throw new Error('批量命令超过数量限制')
      for (let index = next.command.commands.length - 1; index >= 0; index -= 1) {
        const child = next.command.commands[index]
        if (child === undefined) throw new Error('批量命令内容无效')
        pending.push({ command: child, depth: next.depth + 1 })
      }
    } else result = applySingleCommand(result, next.command)
  }
  result = sanitizeSummaryLinks(result)
  validateDocument(result)
  return result
}
