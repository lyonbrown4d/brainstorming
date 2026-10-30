import type { CameraControlsImpl } from '@react-three/drei'
import {
  spatialCameraWheel,
  type CameraSize,
  type CameraWheelAction,
} from '@renderer/lib/spatialCameraNavigation'
import { isCompositionKey } from '@renderer/state/keyboard'

interface IndependentCameraInput {
  readonly canvas: HTMLCanvasElement
  readonly controls: CameraControlsImpl
  readonly size: () => CameraSize
  readonly canNavigate: () => boolean
  readonly pick: (x: number, y: number) => unknown
  readonly start: (event: PointerEvent) => void
  readonly end: () => void
  readonly cancel: () => boolean
  readonly wheel: (action: CameraWheelAction) => void
  readonly truck: (x: number, y: number) => void
}

/** Native canvas input owns only empty-space navigation; scene editing owns hits. */
export const bindIndependentSpatialCameraInput = (input: IndependentCameraInput): (() => void) => {
  const { canvas, controls } = input
  const pointers = new Map<
    number,
    { x: number; y: number; startX: number; startY: number; right: boolean }
  >()
  let dragged = false
  let rightDragged = false
  const down = (event: PointerEvent): void => {
    controls.enabled =
      input.canNavigate() &&
      !event.shiftKey &&
      [0, 1, 2].includes(event.button) &&
      (pointers.size > 0 || !input.pick(event.clientX, event.clientY))
    if (!controls.enabled) return
    if (!pointers.size) {
      dragged = false
      rightDragged = false
      input.start(event)
    }
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      right: event.button === 2,
    })
  }
  const move = (event: PointerEvent): void => {
    const previous = pointers.get(event.pointerId)
    if (!previous) return
    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    dragged ||= Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) > 4
    rightDragged ||= dragged && previous.right
    if (previous.right) input.truck(dx, dy)
    pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY })
  }
  const up = (event: PointerEvent): void => {
    if (!pointers.delete(event.pointerId) || pointers.size) return
    input.end()
  }
  const cancel = (): boolean => {
    pointers.clear()
    controls.enabled = false
    return input.cancel()
  }
  const pointerCancel = (event: PointerEvent): void => {
    if (pointers.has(event.pointerId)) cancel()
  }
  const wheel = (event: WheelEvent): void => {
    if (!input.canNavigate()) return
    const rect = canvas.getBoundingClientRect()
    const action = spatialCameraWheel(event, input.size(), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    if (!action) return
    event.preventDefault()
    event.stopImmediatePropagation()
    input.wheel(action)
  }
  const key = (event: KeyboardEvent): void => {
    const undo =
      (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z'
    if ((event.key !== 'Escape' && !undo) || isCompositionKey(event) || !cancel()) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const blur = (): void => {
    cancel()
  }
  const click = (event: MouseEvent): void => {
    if (!dragged) return
    event.preventDefault()
    event.stopImmediatePropagation()
    dragged = false
  }
  const contextMenu = (event: MouseEvent): void => {
    if (!rightDragged) return
    event.preventDefault()
    event.stopImmediatePropagation()
    rightDragged = false
  }
  canvas.addEventListener('pointerdown', down, true)
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', pointerCancel, true)
  canvas.addEventListener('wheel', wheel, { capture: true, passive: false })
  canvas.addEventListener('click', click, true)
  canvas.addEventListener('dblclick', click, true)
  canvas.addEventListener('contextmenu', contextMenu, true)
  window.addEventListener('keydown', key, true)
  window.addEventListener('blur', blur)
  return () => {
    canvas.removeEventListener('pointerdown', down, { capture: true })
    window.removeEventListener('pointermove', move, { capture: true })
    window.removeEventListener('pointerup', up, { capture: true })
    window.removeEventListener('pointercancel', pointerCancel, { capture: true })
    canvas.removeEventListener('wheel', wheel, { capture: true })
    canvas.removeEventListener('click', click, { capture: true })
    canvas.removeEventListener('dblclick', click, { capture: true })
    canvas.removeEventListener('contextmenu', contextMenu, { capture: true })
    window.removeEventListener('keydown', key, { capture: true })
    window.removeEventListener('blur', blur)
  }
}
