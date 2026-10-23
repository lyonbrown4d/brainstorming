import { Vector3 } from 'three'
import type { Relation } from '@core'
import type { LayoutNode } from '@layout'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import {
  sceneLineVertex,
  sampleScenePath,
  type SceneLineRoute,
} from '@renderer/lib/threeScenePaths'
import { sceneNode } from '@renderer/lib/threeSceneNodes'
import { relationLayoutGeometry, anchorPoint, relationAnchors } from '@shared/relation-geometry'

const nodeIndexes = new WeakMap<readonly LayoutNode[], ReadonlyMap<string, LayoutNode>>()

const relationNodes = (nodes: readonly LayoutNode[]) => {
  let index = nodeIndexes.get(nodes)
  if (!index) {
    index = new Map(nodes.map((node) => [node.id, node]))
    nodeIndexes.set(nodes, index)
  }
  return index
}

export const independentSpatialRelationGeometry = (
  runtime: IndependentSpatialRuntime,
  relation: Relation,
) => {
  const nodes = relationNodes(runtime.model.layout.nodes)
  const from = nodes.get(relation.from)
  const to = nodes.get(relation.to)
  if (!from || !to) return null
  const source = sceneNode(runtime, from),
    target = sceneNode(runtime, to)
  const geometry = relationLayoutGeometry(relation, source, target)
  const anchors = relationAnchors(relation, source, target)
  const start = anchorPoint(source, anchors.source),
    end = anchorPoint(target, anchors.target)
  const route: SceneLineRoute = {
    id: `relation-${relation.id}`,
    path: geometry.path,
    source,
    target,
    sourceDepth: (runtime.model.depths[source.id] ?? 0) + (runtime.offsets.get(source.id)?.z ?? 0),
    targetDepth: (runtime.model.depths[target.id] ?? 0) + (runtime.offsets.get(target.id)?.z ?? 0),
    color: relation.color ?? '#78899a',
    width: relation.width ?? 2,
    dashed: relation.dashed ?? false,
    arrow: relation.arrow ?? 'end',
  }
  const project = (point: { x: number; y: number }, progress = 0.5) => {
    const camera = runtime.camera,
      canvas = runtime.canvas
    if (!camera || !canvas) return { x: 0, y: 0, unit: 1 }
    const vertex = sceneLineVertex(route, point, progress)
    const physical = new Vector3(...vertex.center).applyMatrix4(camera.matrixWorldInverse)
    const unit =
      (Math.max(0.001, -physical.z) * 2 * Math.tan((camera.fov * Math.PI) / 360)) /
      canvas.clientHeight
    physical.x += vertex.anchor[0]
    physical.y += vertex.anchor[1]
    physical.applyMatrix4(camera.projectionMatrix)
    return {
      x: ((physical.x + 1) * canvas.clientWidth) / 2,
      y: ((1 - physical.y) * canvas.clientHeight) / 2,
      unit,
    }
  }
  let sampled: ReturnType<typeof sampleScenePath> | undefined
  const path = () =>
    (sampled ??= sampleScenePath(geometry.path))
      .map((points) =>
        points
          .map((point, index) => {
            const p = project(point, index / Math.max(1, points.length - 1))
            return `${index ? 'L' : 'M'}${p.x},${p.y}`
          })
          .join(' '),
      )
      .join(' ')
  return { ...geometry, start, end, project, screenPath: path }
}

/** One prepared geometry per overlay; camera notifications only read the live lens. */
export const createIndependentSpatialRelationGeometryReader = (
  runtime: IndependentSpatialRuntime,
  relation: Relation,
) => {
  let current: ReturnType<typeof independentSpatialRelationGeometry> | undefined
  return (kind?: 'camera' | 'model' | 'preview') => {
    // Preview maps mutate in place, so every preview notification invalidates geometry.
    if (kind !== 'camera' || current === undefined)
      current = independentSpatialRelationGeometry(
        runtime,
        runtime.relationPreviews.get(relation.id) ?? relation,
      )
    return current
  }
}
