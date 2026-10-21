import type { Viewport } from '@xyflow/react'
import { unprojectSpatialPoint } from '@renderer/lib/spatialCamera'
import type { SpatialView } from '@renderer/state/spatialView'

export const SPATIAL_FOV = 42
const halfFovTangent = Math.tan((SPATIAL_FOV * Math.PI) / 360)

export interface CameraSize {
  readonly width: number
  readonly height: number
}

export const cameraElementSize = (element: HTMLElement): CameraSize => ({
  width: element.clientWidth,
  height: element.clientHeight,
})

export interface CameraWheel {
  readonly deltaX: number
  readonly deltaY: number
  readonly deltaMode: number
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

export type CameraWheelAction =
  | { readonly kind: 'truck'; readonly x: number; readonly y: number }
  | { readonly kind: 'dolly'; readonly y: number }
  | { readonly kind: 'rotate'; readonly x: number; readonly y: number }

/** Browser wheel deltas are pixels, lines, or pages depending on the device. */
export const spatialCameraWheel = (
  event: CameraWheel,
  size: CameraSize,
): CameraWheelAction | null => {
  if (
    !Number.isFinite(event.deltaX) ||
    !Number.isFinite(event.deltaY) ||
    size.width <= 0 ||
    size.height <= 0 ||
    ![0, 1, 2].includes(event.deltaMode)
  )
    return null
  const xScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.width : 1
  const yScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1
  const bound = (value: number): number => Math.max(-240, Math.min(240, value))
  let x = bound(event.deltaX * xScale)
  let y = bound(event.deltaY * yScale)
  if (event.shiftKey && x === 0 && !event.ctrlKey && !event.metaKey) {
    x = y
    y = 0
  }
  if (x === 0 && y === 0) return null
  if (event.ctrlKey || event.metaKey) return { kind: 'dolly', y }
  if (event.altKey) return { kind: 'rotate', x, y }
  return { kind: 'truck', x, y }
}

export const cameraDistanceFromViewport = (height: number, zoom: number): number =>
  height / (2 * halfFovTangent * Math.max(0.01, zoom))

export const cameraViewport = (
  size: CameraSize,
  target: { readonly x: number; readonly y: number },
  distance: number,
): Viewport => {
  const zoom = size.height / (2 * halfFovTangent * distance)
  return {
    x: size.width / 2 - target.x * zoom,
    y: size.height / 2 - target.y * zoom,
    zoom,
  }
}

export const cameraTargetFromViewport = (
  size: CameraSize,
  viewport: Viewport,
  z = 0,
  view?: SpatialView,
): NonNullable<SpatialView['target']> => {
  const point = {
    x: (size.width / 2 - viewport.x) / viewport.zoom,
    y: (size.height / 2 - viewport.y) / viewport.zoom,
    z,
  }
  return view?.mode === '3d' ? unprojectSpatialPoint({ ...point, z: 0 }, view) : point
}

export const cameraFrameFromViewport = (
  view: SpatialView,
  size: CameraSize,
  viewport: Viewport,
): { target: NonNullable<SpatialView['target']>; distance: number } => ({
  target: cameraTargetFromViewport(size, viewport, view.target?.z ?? 0, view),
  distance: cameraDistanceFromViewport(size.height, viewport.zoom),
})

export const initialSpatialCameraFrame = (
  view: SpatialView,
  size: CameraSize,
  viewport: Viewport,
  remembered?: {
    target: NonNullable<SpatialView['target']>
    distance: number
    viewport: Viewport
  },
): { target: NonNullable<SpatialView['target']>; distance: number; viewport: Viewport } => {
  const distance =
    remembered?.distance ??
    view.cameraDistance ??
    cameraDistanceFromViewport(size.height, viewport.zoom)
  const target =
    remembered?.target ?? cameraTargetFromViewport(size, viewport, view.target?.z ?? 0, view)
  return { target, distance, viewport: remembered?.viewport ?? viewport }
}

export const cameraViewportChanged = (left: Viewport, right: Viewport): boolean =>
  Math.abs(left.x - right.x) >= 0.01 ||
  Math.abs(left.y - right.y) >= 0.01 ||
  Math.abs(left.zoom - right.zoom) >= 1e-5

export const cameraOrientation = (
  position: { readonly x: number; readonly y: number; readonly z: number },
  target: { readonly x: number; readonly y: number; readonly z: number },
): Pick<SpatialView, 'yaw' | 'pitch'> => {
  const dx = position.x - target.x
  const dy = position.y - target.y
  const dz = position.z - target.z
  return {
    yaw: Math.atan2(dx, dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
  }
}

export const cameraPositionFor = (
  view: SpatialView,
  distance: number,
): [number, number, number, number, number, number] => {
  const target = view.target ?? { x: 0, y: 0, z: 0 }
  const horizontal = Math.cos(view.pitch) * distance
  return [
    target.x + Math.sin(view.yaw) * horizontal,
    -target.y + Math.sin(view.pitch) * distance,
    target.z + Math.cos(view.yaw) * horizontal,
    target.x,
    -target.y,
    target.z,
  ]
}

export const cameraViewChanged = (before: SpatialView, after: SpatialView): boolean =>
  Math.abs(after.yaw - before.yaw) > 1e-5 ||
  Math.abs(after.pitch - before.pitch) > 1e-5 ||
  Math.abs((after.target?.x ?? 0) - (before.target?.x ?? 0)) > 1e-4 ||
  Math.abs((after.target?.y ?? 0) - (before.target?.y ?? 0)) > 1e-4 ||
  Math.abs((after.target?.z ?? 0) - (before.target?.z ?? 0)) > 1e-4

/** Accept document presets and undo as camera goals without replaying live previews. */
export const externalSpatialCameraFrame = (
  current: SpatialView,
  distance: number,
  baseTarget: NonNullable<SpatialView['target']>,
  next: SpatialView,
): { view: SpatialView; distance: number } | null => {
  if (next.mode !== '3d') return null
  const desired = next.cameraDistance ?? distance
  const view = { ...next, target: next.target ?? baseTarget }
  return cameraViewChanged(current, view) || Math.abs(desired - distance) >= 1e-4
    ? { view, distance: desired }
    : null
}
