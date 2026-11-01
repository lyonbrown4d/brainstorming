import type { MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import {
  filterTopics,
  hasTopicFilters,
  type TopicFilters,
} from '@renderer/components/documents/filterTopics'

/** Filtering is a view projection: original topics, history and export stay intact. */
export const canvasTopicFilter = (document: MindMapDocument, filters: TopicFilters) => {
  if (filters.canvasMode !== 'branches' || !hasTopicFilters(filters))
    return { source: document, visible: null, matches: null }
  const matches = new Set(filterTopics(document, filters).map((topic) => topic.id))
  const parents = new Map<string, string>()
  for (const topic of Object.values(document.topics))
    for (const child of topic.children) parents.set(child, topic.id)
  const visible = new Set<string>([document.rootId])
  for (const id of matches) {
    let cursor: string | undefined = id
    while (cursor && !visible.has(cursor)) {
      visible.add(cursor)
      cursor = parents.get(cursor)
    }
  }
  const topics = { ...document.topics }
  for (const id of visible) {
    const topic = topics[id]
    if (topic?.collapsed && topic.children.some((child) => visible.has(child)))
      topics[id] = { ...topic, collapsed: false }
  }
  return { source: { ...document, topics }, visible, matches }
}

export const filterCanvasLayout = (
  layout: MindMapLayout,
  visible: ReadonlySet<string> | null,
): MindMapLayout =>
  visible
    ? {
        ...layout,
        nodes: layout.nodes.filter((node) => visible.has(node.id)),
        edges: layout.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
        decorations: (layout.decorations ?? []).filter(
          (item) => item.topicId !== undefined && visible.has(item.topicId),
        ),
      }
    : layout
