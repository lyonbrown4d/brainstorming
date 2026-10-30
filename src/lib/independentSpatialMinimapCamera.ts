import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import type { CameraWheelAction } from '@renderer/lib/spatialCameraNavigation'

/** Minimap navigation shares the camera session, never a React Flow viewport. */
export const bindIndependentSpatialMinimapCamera = (
  runtime: IndependentSpatialRuntime,
  canNavigate: () => boolean,
  wheel: (action: CameraWheelAction) => void,
): (() => void) => {
  const pan = (x: number, y: number) => {
    if (canNavigate() && Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0))
      wheel({ kind: 'truck', x: -x, y })
  }
  const zoom = (deltaY: number) => {
    if (canNavigate() && Number.isFinite(deltaY) && deltaY !== 0)
      wheel({ kind: 'dolly', x: 0, y: 0, deltaY })
  }
  runtime.panCameraBy = pan
  runtime.zoomCameraBy = zoom
  return () => {
    if (runtime.panCameraBy === pan) runtime.panCameraBy = () => undefined
    if (runtime.zoomCameraBy === zoom) runtime.zoomCameraBy = () => undefined
  }
}
