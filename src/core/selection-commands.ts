import { pruneDocumentReferences } from './extension-references'
import { normalizeTopicSelection } from './selection'
import { getParentId, getSubtreeIds, requireTopic } from './tree'
import type { Command, MindMapDocument, Side, Topic } from './types'

export function insertionIndex(index: number | undefined, length: number): number {
  const result = index ?? length
  if (!Number.isInteger(result) || result < 0 || result > length)
    throw new Error('子主题插入位置超出范围')
  return result
}

export function assertSide(side: unknown): asserts side is Side {
  if (side !== 'left' && side !== 'right') throw new Error('主题方向无效')
}

export function branchSide(document: MindMapDocument, parent: Topic, side?: Side): Side {
  if (side !== undefined) assertSide(side)
  if (parent.id !== document.rootId) {
    if (side !== undefined && side !== parent.side) throw new Error('子主题必须继承父分支方向')
    return parent.side
  }
  return side ?? (parent.children.length % 2 === 0 ? 'right' : 'left')
}

export function assertNonRoot(document: MindMapDocument, id: string): string {
  if (id === document.rootId) throw new Error('不能删除、移动或改变中心主题的方向')
  const parentId = getParentId(document, id)
  if (parentId === undefined) throw new Error(`主题 ${id} 没有父主题`)
  return parentId
}

export function updateSide(
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

function detachRoots(document: MindMapDocument, roots: readonly string[]): Record<string, Topic> {
  const selected = new Set(roots)
  if (selected.has(document.rootId)) throw new Error('不能删除或移动中心主题')
  const topics = { ...document.topics }
  for (const topic of Object.values(document.topics)) {
    const children = topic.children.filter((id) => !selected.has(id))
    if (children.length !== topic.children.length) topics[topic.id] = { ...topic, children }
  }
  return topics
}

export function deleteTopics(
  document: MindMapDocument,
  topicIds: readonly string[],
): MindMapDocument {
  const roots = normalizeTopicSelection(document, topicIds)
  if (roots.length === 0) return document
  const topics = detachRoots(document, roots)
  const removedIds = new Set<string>()
  for (const id of roots) for (const childId of getSubtreeIds(document, id)) removedIds.add(childId)
  return pruneDocumentReferences({
    ...document,
    topics: Object.fromEntries(Object.entries(topics).filter(([id]) => !removedIds.has(id))),
  })
}

export function moveTopics(
  document: MindMapDocument,
  command: Extract<Command, { type: 'moveTopics' }>,
): MindMapDocument {
  const roots = normalizeTopicSelection(document, command.topicIds)
  const parent = requireTopic(document, command.parentId)
  if (command.side !== undefined) assertSide(command.side)
  const topics = detachRoots(document, roots)
  for (const id of roots)
    if (getSubtreeIds(document, id).includes(parent.id))
      throw new Error('不能将主题移动到自身或后代中')
  const remaining = topics[parent.id]?.children ?? []
  const index = insertionIndex(command.index, remaining.length)
  const children = [...remaining.slice(0, index), ...roots, ...remaining.slice(index)]
  if (roots.length === 0) return document
  topics[parent.id] = { ...parent, children, collapsed: false }
  for (const id of roots) {
    const topic = requireTopic(document, id)
    const side = branchSide(
      document,
      parent,
      command.side ?? (parent.id === document.rootId ? topic.side : undefined),
    )
    updateSide(document, topics, id, side)
  }
  let changed = false
  for (const [id, topic] of Object.entries(topics)) {
    const previous = requireTopic(document, id)
    if (
      topic.side === previous.side &&
      topic.collapsed === previous.collapsed &&
      topic.children.length === previous.children.length &&
      topic.children.every((childId, childIndex) => childId === previous.children[childIndex])
    )
      topics[id] = previous
    else changed = true
  }
  return changed ? { ...document, topics } : document
}
