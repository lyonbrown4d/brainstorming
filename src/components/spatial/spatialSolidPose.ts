import type { LayoutNode } from '@layout'
import {
  projectSpatialPoint,
  spatialPerspectiveScale,
  unprojectSpatialPoint,
} from '@renderer/lib/spatialCamera'
import type { SpatialView } from '@renderer/state/spatialView'

interface ProjectedSolid {
  readonly position: { readonly x: number; readonly y: number }
  readonly width: number
  readonly height: number
  readonly widthTolerance?: number
  readonly heightTolerance?: number
}

export interface SpatialSolidPose {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly width: number
  readonly height: number
}

/** Ignore only floating-point projection noise; keep real drag and resize previews live. */
const sameProjection = (actual: number, expected: number, tolerance = 0): boolean =>
  Math.abs(actual - expected) <=
  Math.max(tolerance, 1e-7, 64 * Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected)))

/** Recover the world-space pose while keeping an untouched solid stable during dolly. */
export const spatialSolidPose = (
  base: Pick<LayoutNode, 'x' | 'y' | 'width' | 'height'>,
  z: number,
  projected: ProjectedSolid,
  view: SpatialView,
): SpatialSolidPose => {
  const canonical = {
    x: base.x + base.width / 2,
    y: base.y + base.height / 2,
    z,
  }
  const screen = projectSpatialPoint(canonical, view)
  const perspectiveScale = spatialPerspectiveScale(view, screen.z)
  const expectedWidth = base.width * perspectiveScale
  const expectedHeight = base.height * perspectiveScale
  const canonicalWidth = sameProjection(projected.width, expectedWidth, projected.widthTolerance)
  const canonicalHeight = sameProjection(
    projected.height,
    expectedHeight,
    projected.heightTolerance,
  )
  const width = canonicalWidth ? base.width : projected.width / perspectiveScale
  const height = canonicalHeight ? base.height : projected.height / perspectiveScale
  const canonicalX = sameProjection(projected.position.x, screen.x - expectedWidth / 2)
  const canonicalY = sameProjection(projected.position.y, screen.y - expectedHeight / 2)
  const projectedX = projected.position.x + (canonicalWidth ? expectedWidth : projected.width) / 2
  const projectedY =
    projected.position.y + (canonicalHeight ? expectedHeight : projected.height) / 2
  const center =
    canonicalX && canonicalY && canonicalWidth && canonicalHeight
      ? canonical
      : unprojectSpatialPoint({ x: projectedX, y: projectedY, z: screen.z }, view)
  return { x: center.x, y: center.y, z: center.z, width, height }
}
