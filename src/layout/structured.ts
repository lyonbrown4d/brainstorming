import type { LayoutKind, MindMapDocument } from '@core'
import { measureTopic } from '@layout/measure'
import { mapLayout, requireUnit, treeLayout } from '@layout/tree-layout'
import { spineLayout } from '@layout/special-layouts'
import { matrixLayout } from '@layout/matrix-layout'
import { alignedTreeLayout, braceLayout } from '@layout/aligned-tree'
import { tableLayout } from '@layout/table-layout'
import {
  layoutBounds,
  type LayoutBounds,
  type LayoutComponent,
  type LayoutUnit,
  type LocalLayout,
  type MindMapLayout,
} from '@layout/types'

const components = (document: MindMapDocument): { plans: LayoutComponent[]; roots: string[] } => {
  const floating = new Set(document.floatingIds ?? [])
  const summary = new Set(
    (document.groups ?? []).flatMap((group) =>
      group.kind === 'summary' &&
      group.summaryTopicId !== undefined &&
      group.topicIds.some((id) => document.topics[id] !== undefined)
        ? [group.summaryTopicId]
        : [],
    ),
  )
  const roots = [document.rootId, ...(document.floatingIds ?? []), ...summary]
  const plans: LayoutComponent[] = []
  const make = (rootId: string, kind: LayoutKind): LayoutComponent => {
    const plan: LayoutComponent = {
      rootId,
      kind,
      ids: [],
      children: new Map(),
      components: new Map(),
    }
    plans.push(plan)
    return plan
  }
  for (const rootId of roots) {
    const topic = document.topics[rootId]
    if (!topic) throw new Error('布局根主题不存在')
    const plan = make(rootId, topic.structure ?? document.settings?.layout ?? 'map')
    const pending = [{ id: rootId, plan }]
    while (pending.length > 0) {
      const current = pending.pop()
      if (!current) break
      const node = document.topics[current.id]
      if (!node) throw new Error('布局主题不存在')
      current.plan.ids.push(node.id)
      const children = node.collapsed
        ? []
        : node.children.filter(
            (id) => !summary.has(id) && (node.id !== document.rootId || !floating.has(id)),
          )
      current.plan.children.set(node.id, children)
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const id = children[index]
        if (id === undefined) continue
        const child = document.topics[id]
        if (!child) throw new Error('布局子主题不存在')
        if (child.structure !== undefined && child.structure !== current.plan.kind) {
          const nested = make(id, child.structure)
          current.plan.ids.push(id)
          current.plan.children.set(id, [])
          current.plan.components.set(id, nested.rootId)
          pending.push({ id, plan: nested })
        } else pending.push({ id, plan: current.plan })
      }
    }
  }
  return { plans, roots }
}
const localLayout = (
  plan: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
): LocalLayout => {
  switch (plan.kind) {
    case 'map':
      return mapLayout(plan, units)
    case 'logic-right':
      return treeLayout(plan, units, 'right')
    case 'logic-left':
      return treeLayout(plan, units, 'left')
    case 'org-down':
      return treeLayout(plan, units, 'down')
    case 'org-up':
      return treeLayout(plan, units, 'up')
    case 'tree-down':
      return alignedTreeLayout(plan, units, 'down')
    case 'tree-up':
      return alignedTreeLayout(plan, units, 'up')
    case 'brace-right':
      return braceLayout(plan, units, 'right')
    case 'brace-left':
      return braceLayout(plan, units, 'left')
    case 'tree-table-right':
      return tableLayout(plan, units, 'right')
    case 'tree-table-down':
      return tableLayout(plan, units, 'down')
    case 'fishbone':
    case 'timeline':
    case 'timeline-vertical':
      return spineLayout(plan, units, plan.kind)
    case 'matrix':
      return matrixLayout(plan, units)
  }
}
interface Computed {
  readonly layout: LocalLayout
  readonly bounds: LayoutBounds
  readonly units: ReadonlyMap<string, LayoutUnit>
}

/** Compose measured subtree boxes around D3/Dagre layouts without recursion or document mutation. */
export const layoutStructuredDocument = (document: MindMapDocument): MindMapLayout => {
  const { plans, roots } = components(document)
  const computed = new Map<string, Computed>()
  for (let index = plans.length - 1; index >= 0; index -= 1) {
    const plan = plans[index]
    if (!plan) continue
    const units = new Map<string, LayoutUnit>()
    for (const id of plan.ids) {
      const topic = document.topics[id]
      if (!topic) throw new Error('布局主题不存在')
      const componentId = plan.components.get(id)
      const nested = componentId === undefined ? undefined : computed.get(componentId)
      const size =
        nested === undefined
          ? measureTopic(topic.title, id === document.rootId, topic.style?.fontSize, topic)
          : {
              width: nested.bounds.maxX - nested.bounds.minX,
              height: nested.bounds.maxY - nested.bounds.minY,
            }
      units.set(id, { id, topic, ...size, ...(componentId === undefined ? {} : { componentId }) })
    }
    const layout = localLayout(plan, units)
    computed.set(plan.rootId, {
      layout,
      bounds: layoutBounds(layout.placements, layout.decorations),
      units,
    })
  }
  const result: MindMapLayout = { nodes: [], edges: [], decorations: [] }
  const main = computed.get(document.rootId)
  const pending: { id: string; x: number; y: number }[] = []
  for (const [index, id] of roots.entries()) {
    const current = computed.get(id)
    if (!current) throw new Error('布局组件不存在')
    const root = requireUnit(current.units, id)
    const position = document.floatingPositions?.[id]
    pending.push(
      id === document.rootId
        ? { id, x: 0, y: 0 }
        : {
            id,
            x: (position?.x ?? (main?.bounds.maxX ?? 0) + 240) + root.width / 2,
            y: (position?.y ?? index * 240) + root.height / 2,
          },
    )
  }
  pending.reverse()
  while (pending.length > 0) {
    const origin = pending.pop()
    if (!origin) break
    const component = computed.get(origin.id)
    if (!component) throw new Error('布局组件不存在')
    for (const placement of component.layout.placements) {
      const { unit, direction } = placement
      if (unit.componentId !== undefined) {
        const nested = computed.get(unit.componentId)
        if (!nested) throw new Error('布局子组件不存在')
        pending.push({
          id: unit.componentId,
          x: origin.x + placement.x - (nested.bounds.minX + nested.bounds.maxX) / 2,
          y: origin.y + placement.y - (nested.bounds.minY + nested.bounds.maxY) / 2,
        })
      } else
        result.nodes.push({
          id: unit.id,
          x: origin.x + placement.x - unit.width / 2,
          y: origin.y + placement.y - unit.height / 2,
          width: unit.width,
          height: unit.height,
          direction,
          side: direction === 'left' ? 'left' : direction === 'right' ? 'right' : unit.topic.side,
        })
    }
    result.edges.push(
      ...component.layout.edges.map((edge) => ({
        ...edge,
        ...(edge.waypoints === undefined
          ? {}
          : {
              waypoints: edge.waypoints.map((point) => ({
                x: point.x + origin.x,
                y: point.y + origin.y,
              })),
            }),
      })),
    )
    result.decorations?.push(
      ...(component.layout.decorations ?? []).map((decoration) => ({
        ...decoration,
        x: decoration.x + origin.x,
        y: decoration.y + origin.y,
      })),
    )
  }
  // A mixed subtree is packed as one box, but explicit ribs must meet its editable root card.
  const nodes = new Map(result.nodes.map((node) => [node.id, node]))
  for (let index = 0; index < result.edges.length; index += 1) {
    const edge = result.edges[index]
    if (!edge?.waypoints?.length) continue
    const target = nodes.get(edge.target)
    if (!target) continue
    const direction = edge.direction ?? 'right'
    const endpoint = {
      x:
        target.x +
        (direction === 'left' ? target.width : direction === 'right' ? 0 : target.width / 2),
      y:
        target.y +
        (direction === 'up' ? target.height : direction === 'down' ? 0 : target.height / 2),
    }
    result.edges[index] = { ...edge, waypoints: [...edge.waypoints.slice(0, -1), endpoint] }
  }
  return result
}
