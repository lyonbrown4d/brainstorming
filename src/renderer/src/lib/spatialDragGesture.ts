import type { RefObject } from 'react'
import type { CameraControlsImpl } from '@react-three/drei'
import type { MindMapDocument } from '@core'
import type { SpatialLayout, SpatialPoint } from '../../../layout/spatial'
import type { SpatialDragPlane, SpatialScreenRect } from './spatialDrag'

export interface SpatialSelectionDragOptions {
  readonly document: MindMapDocument
  readonly layout: SpatialLayout
  readonly focusIds: ReadonlySet<string> | null
  readonly controls: RefObject<CameraControlsImpl | null>
  readonly enabled: boolean
  readonly onSelectionBox: (box: SpatialScreenRect | null) => void
}

export interface SpatialSelectionGesture {
  readonly pointerId: number
  readonly target: Element
  readonly sheetId: string
  readonly start: { x: number; y: number }
  readonly anchorId: string | undefined
  readonly plane: SpatialDragPlane | undefined
  readonly roots: string[]
  readonly ids: ReadonlySet<string>
  readonly selected: readonly string[]
  readonly additive: boolean
  token?: symbol
  moved: boolean
  delta: SpatialPoint
  boxIds: string[]
}

/** Keep capture-phase listeners paired, including cancellation outside the canvas. */
export function bindSpatialDragEvents(
  surface: HTMLElement,
  handlers: {
    down: (event: PointerEvent) => void
    move: (event: PointerEvent) => void
    up: (event: PointerEvent) => void
    lostCapture: (event: PointerEvent) => void
    cancel: () => void
    click: (event: MouseEvent) => void
    key: (event: KeyboardEvent) => void
  },
): () => void {
  const { down, move, up, lostCapture, cancel, click, key } = handlers
  surface.addEventListener('pointerdown', down, true)
  surface.addEventListener('click', click, true)
  surface.addEventListener('lostpointercapture', lostCapture, true)
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', cancel, true)
  window.addEventListener('keydown', key, true)
  window.addEventListener('blur', cancel)
  return () => {
    surface.removeEventListener('pointerdown', down, true)
    surface.removeEventListener('click', click, true)
    surface.removeEventListener('lostpointercapture', lostCapture, true)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('blur', cancel)
  }
}
