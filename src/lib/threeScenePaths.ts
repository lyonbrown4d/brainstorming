import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { LRUCache } from 'lru-cache'
import type { LayoutNode } from '@layout'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { layoutEdgePath, layoutDecorationPath } from '@shared/layout-geometry'
import { relationLayoutGeometry } from '@shared/relation-geometry'
import { topicAppearance } from '@shared/appearance'
import { visualPath } from '@shared/sketch'
import { sceneNode } from '@renderer/lib/threeSceneNodes'
export { sceneNode } from '@renderer/lib/threeSceneNodes'
import { sceneAnnotationGeometry } from '@renderer/lib/threeSceneAnnotations'

export interface ScenePoint {
  readonly x: number
  readonly y: number
}
export interface SceneLineRoute {
  readonly id: string
  readonly path: string
  readonly source: LayoutNode
  readonly target: LayoutNode
  readonly sourceDepth: number
  readonly targetDepth: number
  readonly color: string
  readonly width: number
  readonly dashed: boolean
  readonly arrow: 'none' | 'end' | 'both'
}
const samples = new LRUCache<string, readonly (readonly ScenePoint[])[]>({
  max: 2048,
  maxSize: 2 * 1024 * 1024,
  sizeCalculation: (value, key) =>
    key.length * 2 + value.reduce((sum, path) => sum + path.length * 16, 0),
})

/** SVGLoader handles shared normal and Rough.js paths rather than a second path parser. */
export const sampleScenePath = (path: string): readonly (readonly ScenePoint[])[] => {
  const cached = samples.get(path)
  if (cached) return cached
  const parsed = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}"/></svg>`,
  )
  const subPaths = parsed.paths.flatMap((entry) => entry.subPaths)
  const curveCount = subPaths.reduce((total, subPath) => total + subPath.curves.length, 0)
  const divisions = Math.max(1, Math.min(16, Math.floor(56 / Math.max(1, curveCount))))
  const points = subPaths.map((subPath) =>
    subPath.getPoints(divisions).map(({ x, y }) => ({ x, y })),
  )
  samples.set(path, points)
  return points
}

export const collectSceneRoutes = (
  runtime: IndependentSpatialRuntime,
  only?: ReadonlySet<string>,
): SceneLineRoute[] => {
  const { model } = runtime
  const nodes = new Map(model.layout.nodes.map((node) => [node.id, sceneNode(runtime, node)]))
  const depth = (id: string) => (model.depths[id] ?? 0) + (runtime.offsets.get(id)?.z ?? 0)
  const routes: SceneLineRoute[] = []
  for (const edge of model.layout.edges) {
    if (only && !only.has(edge.id)) continue
    const source = nodes.get(edge.source),
      target = nodes.get(edge.target)
    if (!source || !target || edge.routing === 'hidden') continue
    const from = runtime.offsets.get(source.id),
      to = runtime.offsets.get(target.id)
    const moved = edge.waypoints
      ? {
          ...edge,
          waypoints: edge.waypoints.map((point, index, points) => {
            const t = points.length > 1 ? index / (points.length - 1) : 0
            return {
              x: point.x + (from?.x ?? 0) * (1 - t) + (to?.x ?? 0) * t,
              y: point.y + (from?.y ?? 0) * (1 - t) + (to?.y ?? 0) * t,
            }
          }),
        }
      : edge
    const appearance = topicAppearance(model.document, target.id, model.surface)
    const path = layoutEdgePath(
      moved,
      source,
      target,
      model.document.topics[target.id]?.style?.lineStyle === 'straight',
    )
    routes.push({
      id: edge.id,
      path: visualPath(path, model.document.settings?.visualStyle, `edge:${edge.id}`),
      source,
      target,
      sourceDepth: depth(source.id),
      targetDepth: depth(target.id),
      color: appearance.stroke,
      width: appearance.lineWidth,
      dashed: false,
      arrow: 'none',
    })
  }
  for (const item of model.document.relations ?? []) {
    if (only && !only.has(`relation-${item.id}`)) continue
    const relation = runtime.relationPreviews.get(item.id) ?? item
    const source = nodes.get(relation.from),
      target = nodes.get(relation.to)
    if (!source || !target) continue
    const geometry = relationLayoutGeometry(relation, source, target)
    routes.push({
      id: `relation-${relation.id}`,
      path: visualPath(
        geometry.path,
        model.document.settings?.visualStyle,
        `relation:${relation.id}`,
      ),
      source,
      target,
      sourceDepth: depth(source.id),
      targetDepth: depth(target.id),
      color: relation.color ?? topicAppearance(model.document, source.id, model.surface).stroke,
      width: relation.width ?? 2,
      dashed: relation.dashed ?? false,
      arrow: relation.arrow ?? 'end',
    })
  }
  for (const decoration of model.layout.decorations ?? []) {
    if (only && !only.has(decoration.id)) continue
    const source = nodes.get(decoration.topicId ?? model.document.rootId)
    if (!source) continue
    routes.push({
      id: decoration.id,
      path: visualPath(
        layoutDecorationPath({
          ...decoration,
          x: decoration.x + (runtime.offsets.get(source.id)?.x ?? 0),
          y: decoration.y + (runtime.offsets.get(source.id)?.y ?? 0),
        }),
        model.document.settings?.visualStyle,
        `decoration:${decoration.id}`,
      ),
      source,
      target: source,
      sourceDepth: depth(source.id),
      targetDepth: depth(source.id),
      color: topicAppearance(model.document, source.id, model.surface).stroke,
      width: 1.5,
      dashed: false,
      arrow: 'none',
    })
  }
  return [
    ...routes,
    ...sceneAnnotationGeometry(runtime).routes.filter((route) => !only || only.has(route.id)),
  ]
}

export interface SceneLineVertex {
  readonly center: readonly [number, number, number]
  readonly anchor: readonly [number, number]
}
/** Interpolated world centers connect two camera-facing anchors at their true depth. */
export const sceneLineVertex = (
  route: SceneLineRoute,
  point: ScenePoint,
  progress: number,
): SceneLineVertex => {
  const sx = route.source.x + route.source.width / 2,
    sy = route.source.y + route.source.height / 2
  const tx = route.target.x + route.target.width / 2,
    ty = route.target.y + route.target.height / 2
  const x = sx + (tx - sx) * progress,
    y = sy + (ty - sy) * progress
  return {
    center: [x, -y, route.sourceDepth + (route.targetDepth - route.sourceDepth) * progress],
    anchor: [point.x - x, y - point.y],
  }
}
