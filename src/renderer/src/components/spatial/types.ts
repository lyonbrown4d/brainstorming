import type { MindMapDocument } from '@core'

export interface SpatialCameraState {
  readonly position: readonly [number, number, number]
  readonly target: readonly [number, number, number]
}

export interface SpatialCanvasProps {
  readonly document: MindMapDocument
  readonly selectedId: string
  readonly focusId: string | null
  readonly cameraState?: SpatialCameraState
  readonly onSelect: (id: string) => void
  readonly onFocus: (id: string) => void
  readonly onCollapse: (id: string) => void
  readonly onCameraChange: (camera: SpatialCameraState) => void
}

export interface SpatialCameraActions {
  readonly zoom: (direction: 'in' | 'out') => void
  readonly fit: () => void
  readonly reset: () => void
}
