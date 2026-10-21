import { Box3, Sphere, Vector3 } from 'three'
import type { CameraControlsImpl } from '@react-three/drei'
import type { CanvasStroke } from '@core'
import type { MindMapLayout } from '@layout'
import { inkGeometry } from '@shared/ink-geometry'
import { cameraViewport, type CameraSize } from '@renderer/lib/spatialCameraNavigation'
import type { SpatialCameraCommand } from '@renderer/state/spatialCameraCommands'
import type { SpatialView } from '@renderer/state/spatialView'

export interface SpatialCameraScene {
  readonly layout?: MindMapLayout | undefined
  readonly depths?: Readonly<Record<string, number>> | null | undefined
  readonly drawings?: readonly CanvasStroke[] | undefined
  readonly selectedId: string
  readonly rootId: string
}

const topicCenter = (
  scene: SpatialCameraScene,
  id: string,
): { x: number; y: number; z: number } | null => {
  const node = scene.layout?.nodes.find((candidate) => candidate.id === id)
  return node
    ? {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
        z: scene.depths?.[id] ?? 0,
      }
    : null
}

/** Bound the native 3D scene, including ink, before projection into React Flow. */
const computeSpatialCameraSceneBounds = (
  scene: SpatialCameraScene,
): { box: Box3; sphere: Sphere } | null => {
  const bounds = new Box3()
  for (const node of scene.layout?.nodes ?? []) {
    const z = scene.depths?.[node.id] ?? 0
    bounds.expandByPoint(new Vector3(node.x, -node.y, z))
    bounds.expandByPoint(new Vector3(node.x + node.width, -node.y - node.height, z))
  }
  for (const stroke of scene.drawings ?? []) {
    const { x, y, width, height } = inkGeometry(stroke).bounds
    const z = stroke.spatialDepth ?? 0
    bounds.expandByPoint(new Vector3(x, -y, z))
    bounds.expandByPoint(new Vector3(x + width, -y - height, z))
  }
  if (bounds.isEmpty()) return null
  const sphere = bounds.getBoundingSphere(new Sphere())
  // Cards face the camera, so their corners may extend beyond the XY bounds after orbiting.
  for (const node of scene.layout?.nodes ?? []) {
    const center = new Vector3(
      node.x + node.width / 2,
      -node.y - node.height / 2,
      scene.depths?.[node.id] ?? 0,
    )
    sphere.radius = Math.max(
      sphere.radius,
      center.distanceTo(sphere.center) + Math.hypot(node.width, node.height) / 2,
    )
  }
  for (const stroke of scene.drawings ?? []) {
    const { x, y, width, height } = inkGeometry(stroke).bounds
    const center = new Vector3(x + width / 2, -y - height / 2, stroke.spatialDepth ?? 0)
    sphere.radius = Math.max(
      sphere.radius,
      center.distanceTo(sphere.center) + Math.hypot(width, height) / 2,
    )
  }
  return { box: bounds, sphere }
}

let boundsCache: {
  layout: SpatialCameraScene['layout']
  depths: SpatialCameraScene['depths']
  drawings: SpatialCameraScene['drawings']
  bounds: ReturnType<typeof computeSpatialCameraSceneBounds>
} | null = null

/** Stable native layout identities avoid scanning the scene during a camera gesture. */
const spatialCameraSceneBounds = (
  scene: SpatialCameraScene,
): ReturnType<typeof computeSpatialCameraSceneBounds> => {
  if (
    !boundsCache ||
    boundsCache.layout !== scene.layout ||
    boundsCache.depths !== scene.depths ||
    boundsCache.drawings !== scene.drawings
  )
    boundsCache = {
      layout: scene.layout,
      depths: scene.depths,
      drawings: scene.drawings,
      bounds: computeSpatialCameraSceneBounds(scene),
    }
  return boundsCache.bounds
}

export const spatialCameraSceneSphere = (scene: SpatialCameraScene): Sphere | null =>
  spatialCameraSceneBounds(scene)?.sphere.clone() ?? null

const spatialCameraSceneBox = (scene: SpatialCameraScene): Box3 | null =>
  spatialCameraSceneBounds(scene)?.box.clone() ?? null

/** Scene-relative bounds keep dolly useful at both very small and very large maps. */
export const setSpatialSceneDistanceLimits = (
  controls: CameraControlsImpl,
  scene: SpatialCameraScene,
): void => {
  const radius = spatialCameraSceneSphere(scene)?.radius ?? 250
  controls.minDistance = 150
  controls.maxDistance = Math.max(10_000, radius * 20)
}

export const spatialSceneResetDistance = (
  scene: SpatialCameraScene,
  controls: Pick<CameraControlsImpl, 'getDistanceToFitBox'>,
): number => {
  const box = spatialCameraSceneBox(scene)
  if (!box) return 400
  const size = box.getSize(new Vector3())
  // The earlier spatial camera used one world unit per 100 canvas pixels.
  return Math.max(
    400,
    controls.getDistanceToFitBox(
      size.x * 1.22 + size.z * 0.35,
      size.y * 1.42 + size.z * 0.35,
      Math.max(size.z, 20),
    ),
  )
}

/** First 3D entry derives a camera from the 3D scene, never from a 2D pan or zoom. */
export const spatialCameraDefaultFrame = (
  scene: SpatialCameraScene,
  view: SpatialView,
  size: CameraSize,
  controls: Pick<CameraControlsImpl, 'getDistanceToFitBox'>,
) => {
  const center = spatialCameraSceneBox(scene)?.getCenter(new Vector3()) ?? new Vector3()
  const target = view.target ?? { x: center.x, y: -center.y, z: center.z }
  const distance = spatialSceneResetDistance(scene, controls)
  return { target, distance, viewport: cameraViewport(size, target, distance) }
}

export const runSpatialCameraCommand = (
  controls: CameraControlsImpl,
  command: SpatialCameraCommand,
  scene: SpatialCameraScene,
  size: CameraSize,
  transition: boolean,
): boolean => {
  if (size.width <= 0 || size.height <= 0) return false
  if (command === 'fit') {
    const box = spatialCameraSceneBox(scene)
    if (!box) return false
    const center = box.getCenter(new Vector3())
    void controls.moveTo(center.x, center.y, center.z, transition)
    void controls.dollyTo(spatialSceneResetDistance(scene, controls), transition)
    void controls.setFocalOffset(0, 0, 0, transition)
    return true
  }
  if (command === 'focusSelected' || command === 'centerRoot' || typeof command === 'object') {
    const id =
      typeof command === 'object'
        ? command.topicId
        : command === 'centerRoot'
          ? scene.rootId
          : scene.selectedId
    const target = topicCenter(scene, id)
    if (!target) return false
    void controls.moveTo(target.x, -target.y, target.z, transition)
    return true
  }
  const position = controls.getPosition(new Vector3(), true)
  const target = controls.getTarget(new Vector3(), true)
  const distance = position.distanceTo(target)
  const next =
    command === 'actualSize'
      ? spatialSceneResetDistance(scene, controls)
      : distance * (command === 'zoomIn' ? 0.82 : 1.22)
  void controls.dollyTo(next, transition)
  return true
}
