import { requireTopic } from './tree'
import type { MindMapDocument } from './types'

/** Selected subtree roots in document order, without duplicated descendants. */
export function normalizeTopicSelection(
  document: MindMapDocument,
  topicIds: readonly string[],
): string[] {
  const selected = new Set(topicIds)
  for (const id of selected) requireTopic(document, id)
  const result: string[] = []
  const pending = [document.rootId]
  while (pending.length > 0) {
    const id = pending.pop()
    if (id === undefined) break
    if (selected.has(id)) {
      result.push(id)
      continue
    }
    const topic = requireTopic(document, id)
    for (let index = topic.children.length - 1; index >= 0; index -= 1) {
      const childId = topic.children[index]
      if (childId !== undefined) pending.push(childId)
    }
  }
  return result
}
