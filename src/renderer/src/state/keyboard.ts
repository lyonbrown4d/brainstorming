import type { MindMapDocument } from '@core'
import { layoutDocument, type LayoutDirection, type LayoutNode } from '@layout'

/** Safari may end composition before dispatching its final Enter key. */
export const isCompositionKey = (event: KeyboardEvent): boolean => {
  return event.isComposing || event.key === 'Process' || Reflect.get(event, 'keyCode') === 229
}

interface NavigationLayout {
  readonly nodes: ReadonlyMap<string, LayoutNode>
  readonly parents: ReadonlyMap<string, string>
  readonly incoming: ReadonlyMap<string, LayoutDirection>
  readonly defaultMap: boolean
}

// Commands replace documents; repeated arrows can reuse their visible geometry without retaining them.
const navigationLayouts = new WeakMap<MindMapDocument, NavigationLayout>()
const directions = new Map<string, LayoutDirection>([
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
])
const opposite: Readonly<Record<LayoutDirection, LayoutDirection>> = {
  left: 'right',
  right: 'left',
  up: 'down',
  down: 'up',
}

const navigationLayout = (document: MindMapDocument): NavigationLayout => {
  const cached = navigationLayouts.get(document)
  if (cached) return cached
  const layout = layoutDocument(document)
  const result: NavigationLayout = {
    nodes: new Map(layout.nodes.map((node) => [node.id, node])),
    parents: new Map(layout.edges.map((edge) => [edge.target, edge.source])),
    incoming: new Map(
      layout.edges.flatMap((edge) => (edge.direction ? [[edge.target, edge.direction]] : [])),
    ),
    defaultMap: layout.nodes.every((node) => node.direction === undefined),
  }
  navigationLayouts.set(document, result)
  return result
}

const visibleChildren = (
  document: MindMapDocument,
  layout: NavigationLayout,
  id: string,
): string[] => {
  return (document.topics[id]?.children ?? []).filter((child) => layout.parents.get(child) === id)
}

/** Prefer the nearest card in the same row/column, then penalize perpendicular distance. */
const nearest = (
  origin: LayoutNode,
  candidates: Iterable<LayoutNode>,
  direction: LayoutDirection,
  alignedOnly = false,
): string | undefined => {
  const horizontal = direction === 'left' || direction === 'right'
  const sign = direction === 'left' || direction === 'up' ? -1 : 1
  let best: { id: string; aligned: boolean; score: number } | undefined
  for (const candidate of candidates) {
    if (candidate.id === origin.id) continue
    const dx = candidate.x + candidate.width / 2 - origin.x - origin.width / 2
    const dy = candidate.y + candidate.height / 2 - origin.y - origin.height / 2
    const forward = (horizontal ? dx : dy) * sign
    if (forward <= 1) continue
    const cross = Math.abs(horizontal ? dy : dx)
    const halfBreadth = horizontal
      ? (origin.height + candidate.height) / 2
      : (origin.width + candidate.width) / 2
    const aligned = cross < halfBreadth
    if (alignedOnly && !aligned) continue
    const score = forward * forward + cross * cross * 4
    if (!best || (aligned && !best.aligned) || (aligned === best.aligned && score < best.score))
      best = { id: candidate.id, aligned, score }
  }
  return best?.id
}

/** Resolve visible neighbors in the shared logical layout used by both canvas views. */
export const getNavigationTarget = (
  document: MindMapDocument,
  selectedId: string,
  key: string,
): string | undefined => {
  const direction = directions.get(key)
  if (!direction || !document.topics[selectedId]) return undefined
  const layout = navigationLayout(document)
  const node = layout.nodes.get(selectedId)
  if (!node) return undefined
  const parentId = layout.parents.get(selectedId)
  const siblings = parentId ? visibleChildren(document, layout, parentId) : []
  const children = visibleChildren(document, layout, selectedId)
  if (layout.defaultMap) {
    if (direction === 'up' || direction === 'down') {
      const sameSide = siblings.filter((id) => layout.nodes.get(id)?.side === node.side)
      return sameSide[sameSide.indexOf(selectedId) + (direction === 'up' ? -1 : 1)]
    }
    if (selectedId === document.rootId)
      return children.find((id) => layout.nodes.get(id)?.side === direction)
    return direction === node.side ? children[0] : parentId
  }
  // Enter the first branch in document order, even when a later branch is closer to the center.
  if (direction === node.direction && children.length > 0) return children[0]
  if (direction === opposite[layout.incoming.get(selectedId) ?? node.direction ?? 'right']) {
    const siblingNodes = siblings.flatMap((id) => {
      const sibling = layout.nodes.get(id)
      return sibling ? [sibling] : []
    })
    const sibling = nearest(node, siblingNodes, direction, true)
    if (sibling) return sibling
    if (parentId) return parentId
  }
  return nearest(node, layout.nodes.values(), direction)
}
