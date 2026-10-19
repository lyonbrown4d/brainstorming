import type { MindMapDocument } from '@core'
import type { LayoutNode, MindMapLayout } from '@layout/types'

interface Offset {
  readonly x: number
  readonly y: number
}

const subtreeIds = (document: MindMapDocument, rootId: string): ReadonlySet<string> => {
  const ids = new Set<string>()
  const pending = [rootId]
  while (pending.length > 0) {
    const id = pending.pop()
    if (id === undefined || ids.has(id)) continue
    ids.add(id)
    pending.push(...(document.topics[id]?.children ?? []))
  }
  return ids
}

const rangeBounds = (nodes: readonly LayoutNode[]) => {
  if (nodes.length === 0) return null
  return {
    left: Math.min(...nodes.map(({ x }) => x)),
    right: Math.max(...nodes.map(({ x, width }) => x + width)),
    top: Math.min(...nodes.map(({ y }) => y)),
    bottom: Math.max(...nodes.map(({ y, height }) => y + height)),
  }
}

const topicDepths = (document: MindMapDocument): ReadonlyMap<string, number> => {
  const depths = new Map<string, number>()
  const pending = [{ id: document.rootId, depth: 0 }]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue
    depths.set(current.id, current.depth)
    for (const id of document.topics[current.id]?.children ?? [])
      pending.push({ id, depth: current.depth + 1 })
  }
  return depths
}

/** Place a real topic subtree beside its brace while keeping it in the topic forest. */
export const positionSummaryTopics = (
  document: MindMapDocument,
  layout: MindMapLayout,
): MindMapLayout => {
  const linked = (document.groups ?? []).filter(
    (group) => group.kind === 'summary' && group.summaryTopicId !== undefined,
  )
  if (linked.length === 0) return layout
  const depths = topicDepths(document)
  linked.sort(
    (a, b) => (depths.get(a.summaryTopicId ?? '') ?? 0) - (depths.get(b.summaryTopicId ?? '') ?? 0),
  )
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]))
  const hidden = new Set<string>()
  const edgesBySource = new Map<string, number[]>()
  for (const [index, edge] of layout.edges.entries()) {
    const entries = edgesBySource.get(edge.source) ?? []
    entries.push(index)
    edgesBySource.set(edge.source, entries)
  }
  const decorationsByTopic = new Map<string, number[]>()
  for (const [index, item] of (layout.decorations ?? []).entries()) {
    if (item.topicId === undefined) continue
    const entries = decorationsByTopic.get(item.topicId) ?? []
    entries.push(index)
    decorationsByTopic.set(item.topicId, entries)
  }
  const changedEdges = new Map<number, (typeof layout.edges)[number]>()
  const changedDecorations = new Map<number, NonNullable<typeof layout.decorations>[number]>()
  for (const group of linked) {
    const rootId = group.summaryTopicId
    if (rootId === undefined) continue
    const ids = subtreeIds(document, rootId)
    const sources = group.topicIds.flatMap((id) => {
      const node = hidden.has(id) ? undefined : nodes.get(id)
      return node ? [node] : []
    })
    const bounds = rangeBounds(sources)
    if (bounds === null) {
      for (const id of ids) hidden.add(id)
      continue
    }
    const root = nodes.get(rootId)
    if (!root) continue
    const left = sources.every(({ side }) => side === 'left')
    const desiredX =
      (left ? bounds.left - root.width - 72 : bounds.right + 72) +
      (document.topics[rootId]?.style?.offsetX ?? 0)
    const desiredY =
      (bounds.top + bounds.bottom - root.height) / 2 +
      (document.topics[rootId]?.style?.offsetY ?? 0)
    const delta: Offset = { x: desiredX - root.x, y: desiredY - root.y }
    for (const id of ids) {
      const node = nodes.get(id)
      if (node) nodes.set(id, { ...node, x: node.x + delta.x, y: node.y + delta.y })
      for (const index of edgesBySource.get(id) ?? []) {
        const edge = changedEdges.get(index) ?? layout.edges[index]
        if (!edge?.waypoints) continue
        changedEdges.set(index, {
          ...edge,
          waypoints: edge.waypoints.map((point) => ({
            x: point.x + delta.x,
            y: point.y + delta.y,
          })),
        })
      }
      for (const index of decorationsByTopic.get(id) ?? []) {
        const item = changedDecorations.get(index) ?? layout.decorations?.[index]
        if (item)
          changedDecorations.set(index, { ...item, x: item.x + delta.x, y: item.y + delta.y })
      }
    }
  }
  return {
    nodes: layout.nodes.flatMap((node) => {
      const current = nodes.get(node.id)
      return current && !hidden.has(node.id) ? [current] : []
    }),
    edges: layout.edges.flatMap((edge, index) =>
      hidden.has(edge.source) || hidden.has(edge.target) ? [] : [changedEdges.get(index) ?? edge],
    ),
    ...(layout.decorations === undefined
      ? {}
      : {
          decorations: layout.decorations.flatMap((item, index) =>
            item.topicId && hidden.has(item.topicId) ? [] : [changedDecorations.get(index) ?? item],
          ),
        }),
  }
}
