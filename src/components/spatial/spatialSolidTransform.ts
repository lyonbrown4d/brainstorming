import { Matrix4, Vector3 } from 'three'
import { spatialCameraQuaternion } from '@renderer/lib/spatialCamera'
import type { SpatialView } from '@renderer/state/spatialView'

interface SolidTransformInput {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly scale: number
  readonly thickness: number
}

/** Geometry's last cap stays in the billboard plane; its first cap sits behind it along world Z. */
export const spatialSolidMatrix = (
  view: SpatialView,
  { x, y, z, scale, thickness }: SolidTransformInput,
): Matrix4 => {
  const worldZInCamera = new Vector3(0, 0, 1).applyQuaternion(
    spatialCameraQuaternion(view).invert(),
  )
  return new Matrix4()
    .makeBasis(new Vector3(scale, 0, 0), new Vector3(0, -scale, 0), worldZInCamera)
    .setPosition(new Vector3(x, -y, z).addScaledVector(worldZInCamera, -thickness))
}
