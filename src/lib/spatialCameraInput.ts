import type { CameraControlsImpl } from '@react-three/drei'
import {
  cameraElementSize,
  spatialCameraWheel,
  type CameraSize,
  type CameraWheelAction,
} from '@renderer/lib/spatialCameraNavigation'
import { isCompositionKey } from '@renderer/state/keyboard'

interface SpatialCameraInput {
  readonly element: HTMLElement
  readonly root: HTMLElement
  readonly controls: CameraControlsImpl
  readonly canStart: (event: PointerEvent) => boolean
  readonly canWheel: () => boolean
  readonly size?: () => CameraSize
  readonly onStart: (event: PointerEvent) => void
  readonly onEnd: (pointerId: number) => void
  readonly onCancel: (pointerId?: number) => boolean
  readonly onWheel: (action: CameraWheelAction) => void
  readonly onRightDrag: (deltaX: number, deltaY: number) => void
  readonly onOtherPointerDown: () => void
}

const overControl = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]',
    ),
  )

/** The pane owns blank-area drags; node clicks and Shift marquee reach React Flow. */
export const bindSpatialCameraInput = (input: SpatialCameraInput): (() => void) => {
  const { element, root, controls } = input
  let start: {
    pointerId: number
    x: number
    y: number
    lastX: number
    lastY: number
    right: boolean
  } | null = null
  let otherStart: { pointerId: number; x: number; y: number } | null = null
  let dragged = false
  let rightDragged = false
  const pointerDown = (event: PointerEvent): void => {
    controls.enabled =
      input.canStart(event) &&
      event.target === element &&
      !event.shiftKey &&
      [0, 1, 2].includes(event.button)
    if (!controls.enabled) return
    start = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      right: event.button === 2,
    }
    dragged = false
    rightDragged = false
    input.onStart(event)
  }
  const pointerMove = (event: PointerEvent): void => {
    if (
      otherStart?.pointerId === event.pointerId &&
      Math.hypot(event.clientX - otherStart.x, event.clientY - otherStart.y) > 4
    ) {
      otherStart = null
      input.onOtherPointerDown()
    }
    if (start?.pointerId !== event.pointerId) return
    dragged ||= Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
    rightDragged ||= dragged && start.right
    if (start.right) input.onRightDrag(event.clientX - start.lastX, event.clientY - start.lastY)
    start.lastX = event.clientX
    start.lastY = event.clientY
  }
  const otherPointerDown = (event: PointerEvent): void => {
    if (!(event.target instanceof Element)) return
    if (
      event.target.closest(
        '.topic-scale-control, .react-flow__resize-control, [data-testid^="relation-control-"]',
      )
    ) {
      input.onOtherPointerDown()
      return
    }
    if (
      event.target.closest('.react-flow__node, .react-flow__edge, .react-flow__edgelabel-renderer')
    )
      otherStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }
  const pointerUp = (event: PointerEvent): void => {
    if (otherStart?.pointerId === event.pointerId) otherStart = null
    if (start?.pointerId !== event.pointerId) return
    start = null
    input.onEnd(event.pointerId)
  }
  const pointerCancel = (event: PointerEvent): void => {
    if (otherStart?.pointerId === event.pointerId) otherStart = null
    if (start?.pointerId !== event.pointerId) return
    start = null
    input.onCancel(event.pointerId)
  }
  const stopClick = (event: MouseEvent): void => {
    if (!dragged || event.target !== element) return
    event.preventDefault()
    event.stopImmediatePropagation()
    dragged = false
  }
  const contextMenu = (event: MouseEvent): void => {
    if (!rightDragged || event.target !== element) return
    event.preventDefault()
    event.stopImmediatePropagation()
    rightDragged = false
  }
  const wheel = (event: WheelEvent): void => {
    if (!input.canWheel() || overControl(event.target)) return
    const rect = root.getBoundingClientRect()
    const action = spatialCameraWheel(event, input.size?.() ?? cameraElementSize(root), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    if (!action) return
    event.preventDefault()
    event.stopImmediatePropagation()
    input.onWheel(action)
  }
  const key = (event: KeyboardEvent): void => {
    const undo =
      (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z'
    if ((!undo && event.key !== 'Escape') || isCompositionKey(event) || !input.onCancel()) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const blur = (): void => {
    input.onCancel()
  }
  element.addEventListener('pointerdown', pointerDown, true)
  root.addEventListener('pointerdown', otherPointerDown, true)
  window.addEventListener('pointermove', pointerMove, true)
  window.addEventListener('pointerup', pointerUp, true)
  window.addEventListener('pointercancel', pointerCancel, true)
  element.addEventListener('click', stopClick, true)
  element.addEventListener('dblclick', stopClick, true)
  element.addEventListener('contextmenu', contextMenu, true)
  root.addEventListener('wheel', wheel, { capture: true, passive: false })
  window.addEventListener('keydown', key, true)
  window.addEventListener('blur', blur)
  return () => {
    element.removeEventListener('pointerdown', pointerDown, true)
    root.removeEventListener('pointerdown', otherPointerDown, true)
    window.removeEventListener('pointermove', pointerMove, true)
    window.removeEventListener('pointerup', pointerUp, true)
    window.removeEventListener('pointercancel', pointerCancel, true)
    element.removeEventListener('click', stopClick, true)
    element.removeEventListener('dblclick', stopClick, true)
    element.removeEventListener('contextmenu', contextMenu, true)
    root.removeEventListener('wheel', wheel, true)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('blur', blur)
  }
}
