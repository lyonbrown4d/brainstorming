import type { LayoutNode } from '@layout'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { groupBounds } from '@shared/group-geometry'
import type { SceneLineRoute } from '@renderer/lib/threeScenePaths'
import { sceneNode } from '@renderer/lib/threeSceneNodes'
import { visualPath } from '@shared/sketch'

export interface SceneAnnotationAnchor {
  readonly id: string
  readonly kind: 'group' | 'callout'
  /** Physical Three.js center, with canonical document y already inverted. */
  readonly center: readonly [number, number, number]
  /** Offset from center along camera-right and camera-up. */
  readonly offset: readonly [number, number]
  readonly text: string
  readonly color: string
  readonly width?: number
}
export interface SceneAnnotationFill {
  readonly center: readonly [number, number, number]
  readonly size: readonly [number, number]
  readonly color: string
  readonly opacity: number
}

/** One source of positions for GPU annotations and the shared interactive label overlay. */
export const sceneAnnotationGeometry = (runtime: IndependentSpatialRuntime) => {
  const { model } = runtime
  const routes: SceneLineRoute[] = []
  const anchors: SceneAnnotationAnchor[] = []
  const fills: SceneAnnotationFill[] = []
  if (!model.document.groups?.length && !model.document.callouts?.length)
    return { routes, anchors, fills }
  const nodes = new Map(model.layout.nodes.map((node) => [node.id, sceneNode(runtime, node)]))
  const depth = (id: string) => (model.depths[id] ?? 0) + (runtime.offsets.get(id)?.z ?? 0)
  for (const group of model.document.groups ?? []) {
    const members = group.topicIds.flatMap((id) => {
      const node = nodes.get(id)
      return node ? [node] : []
    })
    const bounds = groupBounds(members)
    if (!bounds) continue
    const color = group.color ?? '#8b79d9'
    const z = members.reduce((total, node) => total + depth(node.id), 0) / members.length
    const center = [bounds.x + bounds.width / 2, -bounds.y - bounds.height / 2, z] as const
    const left = members.every((node) => node.side === 'left')
    const x = left ? bounds.x : bounds.x + bounds.width
    const box: LayoutNode = { ...bounds, id: `group-${group.id}`, side: left ? 'left' : 'right' }
    const path =
      group.kind === 'boundary'
        ? `M ${bounds.x} ${bounds.y} h ${bounds.width} v ${bounds.height} h ${-bounds.width} Z`
        : `M ${x - 8} ${bounds.y} h 8 v ${bounds.height} h -8`
    routes.push({
      id: box.id,
      path: visualPath(path, model.document.settings?.visualStyle, `group:${group.id}`),
      source: box,
      target: box,
      sourceDepth: z,
      targetDepth: z,
      color,
      width: 2,
      dashed: group.kind === 'boundary',
      arrow: 'none',
    })
    if (group.kind === 'boundary')
      fills.push({ center, size: [bounds.width, bounds.height], color, opacity: 0.04 })
    if (group.summaryTopicId === undefined)
      anchors.push({
        id: group.id,
        kind: 'group',
        center,
        offset: [
          group.kind === 'summary' ? x - center[0] + (left ? -8 : 8) : bounds.x - center[0] + 8,
          -bounds.y - center[1] + 20,
        ],
        text: group.title ?? '',
        color,
      })
  }
  for (const callout of model.document.callouts ?? []) {
    const node = nodes.get(callout.topicId)
    if (!node) continue
    anchors.push({
      id: callout.id,
      kind: 'callout',
      center: [node.x + node.width / 2, -node.y - node.height / 2, depth(node.id)],
      offset: [node.width / 2 + 14, node.height / 2 + 16],
      text: callout.text,
      color: '#92400e',
      width: 192,
    })
  }
  return { routes, anchors, fills }
}

export const sceneAnnotationAnchors = (
  runtime: IndependentSpatialRuntime,
): readonly SceneAnnotationAnchor[] => sceneAnnotationGeometry(runtime).anchors
