import { getParentId, type MindMapDocument } from '@/core'

/** Safari may end composition before dispatching its final Enter key. */
export function isCompositionKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.key === 'Process' || Reflect.get(event, 'keyCode') === 229
}

/** Resolve only visible tree neighbors; collapsed children never receive selection. */
export function getNavigationTarget(
  document: MindMapDocument,
  selectedId: string,
  key: string,
): string | undefined {
  const topic = document.topics[selectedId]
  if (!topic) return undefined
  const parentId = getParentId(document, selectedId)
  const parent = parentId ? document.topics[parentId] : undefined
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const siblings = parent?.children ?? [selectedId]
    return siblings[siblings.indexOf(selectedId) + (key === 'ArrowUp' ? -1 : 1)]
  }
  if (topic.id === document.rootId) {
    if (topic.collapsed) return undefined
    return topic.children.find(
      (id) => document.topics[id]?.side === (key === 'ArrowLeft' ? 'left' : 'right'),
    )
  }
  const outward =
    (topic.side === 'left' && key === 'ArrowLeft') ||
    (topic.side === 'right' && key === 'ArrowRight')
  return outward ? (topic.collapsed ? undefined : topic.children[0]) : parentId
}
