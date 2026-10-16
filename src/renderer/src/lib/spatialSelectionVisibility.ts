import { Euler, Quaternion, Vector3, type Camera } from 'three'
import type { SpatialNode } from '../../../layout/spatial'
import type { ViewportBounds } from './spatialSafeViewport'

/** Reveal a newly selected card with a view translation; preserve its perspective depth. */
export function spatialSelectionShift(
  camera: Camera,
  node: Pick<SpatialNode, 'position' | 'width' | 'height'>,
  viewport: ViewportBounds,
  visible: ViewportBounds = viewport,
): Vector3 | null {
  if (viewport.width <= 0 || viewport.height <= 0) return null
  camera.updateWorldMatrix(true, false)
  const center = new Vector3(...node.position)
  const projected = center.clone().project(camera)
  if (!Number.isFinite(projected.z) || projected.z < -1 || projected.z > 1) return null
  const facing = camera.getWorldQuaternion(new Quaternion())
  const tilt = new Euler(0.025, -0.09, 0)
  const points: Vector3[] = []
  for (const x of [-node.width / 2, node.width / 2])
    for (const y of [-node.height / 2, node.height / 2])
      for (const z of [-0.08, 0.08])
        points.push(
          new Vector3(x, y, z).applyEuler(tilt).applyQuaternion(facing).add(center).project(camera),
        )
  if (points.some((point) => !point.toArray().every(Number.isFinite))) return null
  const left = ((Math.min(...points.map((point) => point.x)) + 1) * viewport.width) / 2
  const right = ((Math.max(...points.map((point) => point.x)) + 1) * viewport.width) / 2
  const top = ((1 - Math.max(...points.map((point) => point.y))) * viewport.height) / 2
  const bottom = ((1 - Math.min(...points.map((point) => point.y))) * viewport.height) / 2
  const insetX = Math.min(28, visible.width / 4)
  const insetTop = Math.min(84, visible.height / 4)
  const insetBottom = Math.min(112, visible.height / 4)
  const dx = revealOffset(
    left,
    right,
    visible.left - viewport.left + insetX,
    visible.left - viewport.left + visible.width - insetX,
    ((projected.x + 1) * viewport.width) / 2,
  )
  const dy = revealOffset(
    top,
    bottom,
    visible.top - viewport.top + insetTop,
    visible.top - viewport.top + visible.height - insetBottom,
    ((1 - projected.y) * viewport.height) / 2,
  )
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null
  const desired = new Vector3(
    projected.x + (2 * dx) / viewport.width,
    projected.y - (2 * dy) / viewport.height,
    projected.z,
  ).unproject(camera)
  return center.sub(desired)
}

function revealOffset(
  start: number,
  end: number,
  safeStart: number,
  safeEnd: number,
  center: number,
): number {
  // A card wider than the usable surface can only be centered without changing the user's zoom.
  if (end - start > safeEnd - safeStart) return (safeStart + safeEnd) / 2 - center
  if (start < safeStart) return safeStart - start
  return end > safeEnd ? safeEnd - end : 0
}
