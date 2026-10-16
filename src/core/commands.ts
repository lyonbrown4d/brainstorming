import { getParentId, getSubtreeIds, requireTopic } from './tree'
import type { Command, MindMapDocument, Side, Topic } from './types'
import { assertId, validateDocument } from './validation'
import { normalizeTopicStyle, validateTopicStyle } from './topic-style'
import { applyTopicContentCommand } from './content-commands'

function insertionIndex(index: number | undefined, length: number): number {
  const result = index ?? length
  if (!Number.isInteger(result) || result < 0 || result > length)
    throw new Error('子主题插入位置超出范围')
  return result
}

function assertSide(side: unknown): asserts side is Side {
  if (side !== 'left' && side !== 'right') throw new Error('主题方向无效')
}

function branchSide(document: MindMapDocument, parent: Topic, side?: Side): Side {
  if (side !== undefined) assertSide(side)
  if (parent.id !== document.rootId) {
    if (side !== undefined && side !== parent.side) throw new Error('子主题必须继承父分支方向')
    return parent.side
  }
  return side ?? (parent.children.length % 2 === 0 ? 'right' : 'left')
}

function assertNonRoot(document: MindMapDocument, id: string): string {
  if (id === document.rootId) throw new Error('不能删除、移动或改变中心主题的方向')
  const parentId = getParentId(document, id)
  if (parentId === undefined) throw new Error(`主题 ${id} 没有父主题`)
  return parentId
}

function updateSide(
  document: MindMapDocument,
  topics: Record<string, Topic>,
  id: string,
  side: Side,
): void {
  for (const childId of getSubtreeIds(document, id)) {
    const topic = requireTopic(document, childId)
    if (topic.side !== side) topics[childId] = { ...topic, side }
  }
}

function add(
  document: MindMapDocument,
  command: Extract<Command, { type: 'addTopic' }>,
): MindMapDocument {
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

function remove(document: MindMapDocument, topic: Topic): MindMapDocument {
  const parent = requireTopic(document, assertNonRoot(document, topic.id))
  const removedIds = new Set(getSubtreeIds(document, topic.id))
  const topics = {
    ...Object.fromEntries(Object.entries(document.topics).filter(([id]) => !removedIds.has(id))),
    [parent.id]: { ...parent, children: parent.children.filter((id) => id !== topic.id) },
  }
  return { ...document, topics }
}

function move(
  document: MindMapDocument,
  topic: Topic,
  command: Extract<Command, { type: 'moveTopic' }>,
): MindMapDocument {
  const oldParent = requireTopic(document, assertNonRoot(document, topic.id))
  const parent = requireTopic(document, command.parentId)
  if (getSubtreeIds(document, topic.id).includes(parent.id))
    throw new Error('不能将主题移动到自身或后代中')
  const children = parent.children.filter((id) => id !== topic.id)
  children.splice(insertionIndex(command.index, children.length), 0, topic.id)
  const side = branchSide(
    document,
    parent,
    command.side ?? (parent.id === document.rootId ? topic.side : undefined),
  )
  const sameOrder =
    oldParent.id === parent.id && children.every((id, index) => id === parent.children[index])
  if (sameOrder && side === topic.side && !parent.collapsed) return document
  const topics = {
    ...document.topics,
    [oldParent.id]: { ...oldParent, children: oldParent.children.filter((id) => id !== topic.id) },
    [parent.id]: { ...parent, children, collapsed: false },
  }
  updateSide(document, topics, topic.id, side)
  return { ...document, topics }
}

/** All document edits pass through this atomic, immutable command boundary. */
export function applyCommand(document: MindMapDocument, command: Command): MindMapDocument {
  validateDocument(document)
  if (command.type === 'addTopic') return add(document, command)
  const topic = requireTopic(document, command.topicId)
  switch (command.type) {
    case 'setTopicNotes':
    case 'setTopicImage':
    case 'removeTopicImage':
    case 'addTopicAttachment':
    case 'removeTopicAttachment':
      return applyTopicContentCommand(document, topic, command)
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
        topics: { ...document.topics, [topic.id]: { ...topic, title: command.title } },
      }
    }
    case 'deleteTopic':
      return remove(document, topic)
    case 'moveTopic':
      return move(document, topic, command)
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
