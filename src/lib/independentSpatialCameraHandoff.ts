import type { SpatialCameraSession } from '@renderer/state/spatialNavigation'

/** Consecutive inputs may overlap damping, while retaining one continuous pose gesture. */
export const resumeIndependentSpatialCameraSession = (
  session: SpatialCameraSession | null,
  pointerId: number | null,
): SpatialCameraSession | null =>
  session?.ended ? { ...session, pointerId, ended: false, wheelCommit: true } : null
