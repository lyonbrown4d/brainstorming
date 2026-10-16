import type { MindMapDocument, Topic } from './types'

export function requireTopic(document: MindMapDocument, id: string): Topic {
  const topic = Object.hasOwn(document.topics, id) ? document.topics[id] : undefined
  if (!topic) throw new Error(`主题 ${id} 不存在`)
  return topic
}

export function getParentId(document: MindMapDocument, topicId: string): string | undefined {
  return Object.values(document.topics).find((topic) => topic.children.includes(topicId))?.id
}

export function getSubtreeIds(document: MindMapDocument, topicId: string): string[] {
  const result: string[] = []
  const pending = [topicId]
  while (pending.length > 0) {
    const id = pending.pop()
    if (id === undefined) break
    const topic = requireTopic(document, id)
    result.push(id)
    for (let index = topic.children.length - 1; index >= 0; index -= 1) {
      const childId = topic.children[index]
      if (childId !== undefined) pending.push(childId)
    }
  }
  return result
}

/** Visible depth-first order; floating roots remain independent of center collapse. */
export function getVisibleTopicIds(document: MindMapDocument): readonly string[] {
  const result: string[] = []
  const floating = new Set(document.floatingIds ?? [])
  const pending = [...(document.floatingIds ?? [])].reverse()
  pending.push(document.rootId)
  while (pending.length > 0) {
    const id = pending.pop()
    if (id === undefined) break
    const topic = requireTopic(document, id)
    result.push(id)
    if (!topic.collapsed) {
      for (let index = topic.children.length - 1; index >= 0; index -= 1) {
        const childId = topic.children[index]
        if (childId !== undefined && (id !== document.rootId || !floating.has(childId)))
          pending.push(childId)
      }
    }
  }
  return result
}
