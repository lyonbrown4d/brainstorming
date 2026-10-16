import { assertNonRoot, deleteTopics, moveTopics } from './selection-commands'
import { requireTopic } from './tree'
import type { Command, MindMapDocument } from './types'
import { assertId } from './validation'

function structuralParent(document: MindMapDocument, topicId: string): string {
  requireTopic(document, topicId)
  const parentId = assertNonRoot(document, topicId)
  if (document.floatingIds?.includes(topicId)) throw new Error('游离主题不支持此结构操作')
  return parentId
}

/** Wrap one existing branch without changing topic IDs or annotation endpoints. */
export function insertParentTopic(
  document: MindMapDocument,
  command: Extract<Command, { type: 'insertParentTopic' }>,
): MindMapDocument {
  const parentId = structuralParent(document, command.topicId)
  assertId(command.id)
  if (Object.hasOwn(document.topics, command.id)) throw new Error(`主题 ${command.id} 已存在`)
  if (typeof command.title !== 'string') throw new Error('标题必须是文本')
  const topic = requireTopic(document, command.topicId)
  const parent = requireTopic(document, parentId)
  return {
    ...document,
    topics: {
      ...document.topics,
      [parentId]: {
        ...parent,
        children: parent.children.map((id) => (id === topic.id ? command.id : id)),
        collapsed: false,
      },
      [command.id]: {
        id: command.id,
        title: command.title,
        children: [topic.id],
        collapsed: false,
        side: topic.side,
      },
    },
  }
}

/** Promote children into their parent's slot, then prune only the removed topic's references. */
export function removeTopicOnly(document: MindMapDocument, topicId: string): MindMapDocument {
  const parentId = structuralParent(document, topicId)
  const topic = requireTopic(document, topicId)
  const parent = requireTopic(document, parentId)
  const promoted = moveTopics(document, {
    type: 'moveTopics',
    topicIds: topic.children,
    parentId,
    index: parent.children.indexOf(topicId),
  })
  return deleteTopics(promoted, [topicId])
}
