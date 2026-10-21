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

/** Fit the native 3D scene, including ink, before projection into React Flow. */
const computeSpatialCameraSceneSphere = (scene: SpatialCameraScene): Sphere | null => {
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
  return sphere
}

let sphereCache: {
  layout: SpatialCameraScene['layout']
  depths: SpatialCameraScene['depths']
  drawings: SpatialCameraScene['drawings']
  sphere: Sphere | null
} | null = null

/** Stable native layout identities avoid scanning the scene during a camera gesture. */
export const spatialCameraSceneSphere = (scene: SpatialCameraScene): Sphere | null => {
  if (
    !sphereCache ||
    sphereCache.layout !== scene.layout ||
    sphereCache.depths !== scene.depths ||
    sphereCache.drawings !== scene.drawings
  )
    sphereCache = {
      layout: scene.layout,
      depths: scene.depths,
      drawings: scene.drawings,
      sphere: computeSpatialCameraSceneSphere(scene),
    }
  return sphereCache.sphere?.clone() ?? null
}

/** Scene-relative bounds keep dolly useful at both very small and very large maps. */
export const setSpatialSceneDistanceLimits = (
  controls: CameraControlsImpl,
  scene: SpatialCameraScene,
): void => {
  const radius = spatialCameraSceneSphere(scene)?.radius ?? 250
  controls.minDistance = Math.max(5, radius * 0.05)
  controls.maxDistance = Math.max(1_000, radius * 60)
}

export const spatialSceneResetDistance = (scene: SpatialCameraScene, size: CameraSize): number => {
  const radius = spatialCameraSceneSphere(scene)?.radius ?? 250
  const vertical = (21 * Math.PI) / 180
  const horizontal = Math.atan(Math.tan(vertical) * (size.width / size.height))
  return (radius * 1.15) / Math.sin(Math.min(vertical, horizontal))
}

/** First 3D entry derives a camera from the 3D scene, never from a 2D pan or zoom. */
export const spatialCameraDefaultFrame = (
  scene: SpatialCameraScene,
  view: SpatialView,
  size: CameraSize,
) => {
  const center = spatialCameraSceneSphere(scene)?.center ?? new Vector3()
  const target = view.target ?? { x: center.x, y: -center.y, z: center.z }
  const distance = spatialSceneResetDistance(scene, size)
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
    const sphere = spatialCameraSceneSphere(scene)
    if (!sphere) return false
    void controls.fitToSphere(sphere, transition)
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
      ? spatialSceneResetDistance(scene, size)
      : distance * (command === 'zoomIn' ? 1 / 1.2 : 1.2)
  void controls.dollyTo(next, transition)
  return true
}
