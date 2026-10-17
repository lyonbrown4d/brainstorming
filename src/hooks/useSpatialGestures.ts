import { useEffect, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { CameraControlsImpl } from '@react-three/drei'
import { Vector3 } from 'three'
import { spatialWheelGesture } from '@renderer/lib/spatialGestures'

interface SpatialGestureOptions {
  readonly canvas: HTMLCanvasElement
  readonly controls: RefObject<CameraControlsImpl | null>
  readonly enabled: boolean
  readonly animation: boolean
}

/** Maps trackpad intent to CameraControls; camera movement and limits stay in the library. */
export const useSpatialGestures = ({
  canvas,
  controls,
  enabled,
  animation,
}: SpatialGestureOptions): void => {
  const get = useThree((state) => state.get)

  useEffect(() => {
    // Drei Html labels are siblings of the canvas; capture both on their shared container.
    const container =
      canvas.closest<HTMLElement>('[data-spatial-surface]') ?? canvas.parentElement ?? canvas
    const target = new Vector3()
    const pointer = (event: PointerEvent): void => {
      if (!controls.current || event.button !== 0) return
      controls.current.mouseButtons.left = event.altKey
        ? CameraControlsImpl.ACTION.ROTATE
        : CameraControlsImpl.ACTION.TRUCK
    }
    const wheel = (event: WheelEvent): void => {
      const controller = controls.current
      if (!controller || event.defaultPrevented) return
      if (
        event.target instanceof Element &&
        event.target.closest(
          '[contenteditable]:not([contenteditable="false"]), input, textarea, select, [role="textbox"]',
        )
      )
        return
      const { size, viewport, invalidate } = get()
      const gesture = spatialWheelGesture(event, size)
      if (!gesture) return
      if (!enabled || !controller.enabled) {
        if (event.ctrlKey || event.metaKey) event.preventDefault()
        return
      }
      // The non-passive listener also prevents browser page zoom during Ctrl+wheel pinch.
      event.preventDefault()
      if (gesture.kind === 'pan') {
        const { factor } = viewport.getCurrentViewport(
          controller.camera,
          controller.getTarget(target),
        )
        if (!Number.isFinite(factor) || factor <= 0) return
        void controller.truck(gesture.x / factor, gesture.y / factor, animation)
      } else if (gesture.kind === 'dolly') {
        void controller.dolly(controller.distance * (1 - Math.exp(gesture.y * 0.008)), animation)
      } else {
        const radiansPerPixel = (Math.PI * 2) / size.height
        void controller.rotate(gesture.x * radiansPerPixel, gesture.y * radiansPerPixel, animation)
      }
      invalidate()
    }
    container.addEventListener('wheel', wheel, { capture: true, passive: false })
    container.addEventListener('pointerdown', pointer, true)
    return () => {
      container.removeEventListener('wheel', wheel, { capture: true })
      container.removeEventListener('pointerdown', pointer, true)
    }
  }, [animation, canvas, controls, enabled, get])
}
