import type { CameraControlsImpl } from '@react-three/drei'
import { bindSpatialCameraInput } from '@renderer/lib/spatialCameraInput'
import {
  freezeSpatialControls,
  truckSpatialCameraPixels,
} from '@renderer/lib/spatialCameraController'
import type { CameraSize, CameraWheelAction } from '@renderer/lib/spatialCameraNavigation'
import type { SpatialView } from '@renderer/state/spatialView'

interface GestureInput {
  readonly element: HTMLElement
  readonly root: HTMLElement
  readonly controls: CameraControlsImpl
  readonly size: () => CameraSize
  readonly canNavigate: () => boolean
  readonly onStart: (event: PointerEvent) => void
  readonly onEnd: (pointerId: number) => void
  readonly onCancel: (pointerId?: number) => boolean
  readonly onWheel: (action: CameraWheelAction) => void
  readonly distance: () => number
  readonly view: () => SpatialView
  readonly pendingMotion: () => boolean
  readonly onFrozen: (snapshot: ReturnType<typeof freezeSpatialControls>) => void
  readonly wake: () => void
}

/** Keep native drag and edit-freeze wiring out of the camera's lifecycle. */
export const bindSpatialCameraGestureInput = (input: GestureInput): (() => void) =>
  bindSpatialCameraInput({
    element: input.element,
    root: input.root,
    controls: input.controls,
    canStart: input.canNavigate,
    canWheel: input.canNavigate,
    size: input.size,
    onStart: input.onStart,
    onEnd: input.onEnd,
    onCancel: input.onCancel,
    onWheel: input.onWheel,
    onRightDrag: (dx, dy) => {
      truckSpatialCameraPixels(input.controls, input.distance(), input.size().height, dx, dy)
      input.wake()
    },
    onOtherPointerDown: () => {
      if (input.pendingMotion())
        input.onFrozen(freezeSpatialControls(input.controls, input.view(), input.size()))
    },
  })
