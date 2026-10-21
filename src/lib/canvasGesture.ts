import type { Command, MindMapDocument } from '@core'
import { getSubtreeIds } from '@core/tree'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { inkGeometry, transformInk } from '@shared/ink-geometry'
import { canvasDropCommand, type CanvasDrop } from '@renderer/lib/canvasDrop'

/** Floating roots have no visual parent, including when selected with the main map. */
export const canvasTopicRoots = (document: MindMapDocument, ids: readonly string[]): string[] => {
  const selected = new Set(ids)
  const parents = new Map<string, string>()
  for (const topic of Object.values(document.topics))
    for (const child of topic.children) parents.set(child, topic.id)
  const floating = new Set(document.floatingIds)
  return [...selected].filter((id) => {
    let current = id
    while (!floating.has(current)) {
      const parent = parents.get(current)
      if (!parent) break
      if (selected.has(parent)) return false
      current = parent
    }
    return Boolean(document.topics[id])
  })
}

export const canvasDescendants = (
  document: MindMapDocument,
  roots: readonly string[],
): string[] => {
  const independent = new Set(document.floatingIds?.flatMap((id) => getSubtreeIds(document, id)))
  return roots.flatMap((id) =>
    getSubtreeIds(document, id).filter((key) => id !== document.rootId || !independent.has(key)),
  )
}

export const canvasMoveCommand = (
  document: MindMapDocument,
  roots: readonly string[],
  drawings: readonly string[],
  origins: ReadonlyMap<string, { x: number; y: number }>,
  delta: { x: number; y: number; z?: number },
  drop?: CanvasDrop,
): Command | undefined => {
  if (!delta.x && !delta.y && !delta.z) return undefined
  const commands: Command[] = []
  const topics = roots.length ? canvasDropCommand(document, roots, origins, delta, drop) : undefined
  if (topics) commands.push(topics)
  for (const stroke of document.drawings ?? []) {
    if (!drawings.includes(stroke.id)) continue
    const bounds = inkGeometry(stroke).bounds
    commands.push({
      type: 'upsertDrawing',
      stroke: {
        ...transformInk(stroke, bounds, {
          ...bounds,
          x: bounds.x + delta.x,
          y: bounds.y + delta.y,
        }),
        ...(delta.z ? { spatialDepth: (stroke.spatialDepth ?? 0) + delta.z } : {}),
      },
    })
  }
  return commands.length ? { type: 'batch', commands } : undefined
}

export const canvasSelection = (nodes: readonly CanvasFlowNode[]) => ({
  topics: nodes.filter((node) => node.type !== 'ink').map((node) => node.id),
  drawings: nodes.flatMap((node) => (node.type === 'ink' ? [node.data.stroke.id] : [])),
})
