import { useLayoutEffect } from 'react'
import type { CanvasProjectionController } from '@renderer/lib/canvasProjectionController'
import type { CanvasProjectionFrame } from '@renderer/lib/canvasProjectionFrame'

/** Publish completed native 2D geometry to its mounted canonical projection. */
export const useCanvasCameraProjection = (
  controller: CanvasProjectionController,
  frame: CanvasProjectionFrame | null,
): void => {
  useLayoutEffect(() => {
    controller.updateFrame(frame)
  }, [controller, frame])
}
