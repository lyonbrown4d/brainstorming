import type { LayoutKind, MindMapDocument } from '@core'
import { measureTopic } from './measure'
import { mapLayout, requireUnit, treeLayout } from './tree-layout'
import { matrixLayout, spineLayout } from './special-layouts'
import {
  layoutBounds,
  type LayoutBounds,
  type LayoutComponent,
  type LayoutUnit,
  type LocalLayout,
  type MindMapLayout,
} from './types'

function components(document: MindMapDocument): { plans: LayoutComponent[]; roots: string[] } {
  const floating = new Set(document.floatingIds ?? [])
  const roots = [document.rootId, ...(document.floatingIds ?? [])]
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
        : node.children.filter((id) => node.id !== document.rootId || !floating.has(id))
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
function localLayout(plan: LayoutComponent, units: ReadonlyMap<string, LayoutUnit>): LocalLayout {
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
    case 'fishbone':
      return spineLayout(plan, units, true)
    case 'timeline':
      return spineLayout(plan, units, false)
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
export function layoutStructuredDocument(document: MindMapDocument): MindMapLayout {
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
    computed.set(plan.rootId, { layout, bounds: layoutBounds(layout.placements), units })
  }
  const result: MindMapLayout = { nodes: [], edges: [] }
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
    result.edges.push(...component.layout.edges)
  }
  return result
}
