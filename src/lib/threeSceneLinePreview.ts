import type {
  IndependentSpatialRuntime,
  SpatialSceneOffset,
} from '@renderer/lib/independentSpatialRuntime'
import type { SceneLineRoute } from '@renderer/lib/threeScenePaths'

const zero: SpatialSceneOffset = { x: 0, y: 0, z: 0 }
export const commonSceneLineOffset = (
  runtime: IndependentSpatialRuntime,
): SpatialSceneOffset | null => {
  if (runtime.relationPreviews.size || [...runtime.scales.values()].some((scale) => scale !== 1))
    return null
  const first = runtime.model.layout.nodes[0]
  const offset = first ? (runtime.offsets.get(first.id) ?? zero) : zero
  for (const node of runtime.model.layout.nodes) {
    const value = runtime.offsets.get(node.id) ?? zero
    if (value.x !== offset.x || value.y !== offset.y || value.z !== offset.z) return null
  }
  return offset
}

/** The stamp checks preview state only, without constructing or parsing an SVG path. */
export const sceneLinePreviewStamp = (
  runtime: IndependentSpatialRuntime,
  route: SceneLineRoute,
): string => {
  const group = route.id.startsWith('group-')
    ? runtime.model.document.groups?.find((item) => `group-${item.id}` === route.id)
    : undefined
  const ids = group?.topicIds ?? [route.source.id, route.target.id]
  const positions = ids
    .map((id) => {
      const offset = runtime.offsets.get(id) ?? zero
      return `${offset.x}:${offset.y}:${offset.z}:${runtime.scales.get(id) ?? 1}`
    })
    .join('/')
  const relation = route.id.startsWith('relation-')
    ? runtime.relationPreviews.get(route.id.slice('relation-'.length))
    : undefined
  return relation ? `${positions}/${JSON.stringify(relation)}` : positions
}

export const sceneRouteTranslation = (
  runtime: IndependentSpatialRuntime,
  route: SceneLineRoute,
): SpatialSceneOffset | null => {
  if (
    route.id.startsWith('relation-') &&
    runtime.relationPreviews.has(route.id.slice('relation-'.length))
  )
    return null
  const group = route.id.startsWith('group-')
    ? runtime.model.document.groups?.find((item) => `group-${item.id}` === route.id)
    : undefined
  const ids = group?.topicIds ?? [route.source.id, route.target.id]
  const first = ids[0]
  const translation = first ? (runtime.offsets.get(first) ?? zero) : zero
  for (const id of ids) {
    const offset = runtime.offsets.get(id) ?? zero
    if (
      (runtime.scales.get(id) ?? 1) !== 1 ||
      offset.x !== translation.x ||
      offset.y !== translation.y ||
      offset.z !== translation.z
    )
      return null
  }
  return translation
}
