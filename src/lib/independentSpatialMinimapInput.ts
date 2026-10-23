import type { IndependentMinimapGeometry } from '@renderer/lib/independentSpatialMinimapGeometry'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'

interface MinimapInput {
  readonly canvas: HTMLCanvasElement
  readonly runtime: IndependentSpatialRuntime
  readonly geometry: () => IndependentMinimapGeometry | null
  readonly blocked: () => boolean
  readonly focus: (point: { x: number; y: number }) => void
  readonly navigating: (active: boolean) => void
  readonly viewport: (x: number, y: number) => void
}

/** Pointer deltas use the painted projection, never a newly projected all-topic frame. */
export const bindIndependentSpatialMinimapInput = (input: MinimapInput): (() => void) => {
  const { canvas, runtime } = input
  let drag: {
    id: number
    x: number
    y: number
    startX: number
    startY: number
    scale: number
  } | null = null
  let moved = false
  let x = 0,
    y = 0
  const down = (event: PointerEvent): void => {
    const geometry = input.geometry()
    if (event.button !== 0 || drag || input.blocked() || !geometry) return
    event.preventDefault()
    event.stopPropagation()
    runtime.freezeCamera()
    canvas.focus({ preventScroll: true })
    canvas.setPointerCapture(event.pointerId)
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      scale: geometry.scale,
    }
    moved = false
    x = 0
    y = 0
    input.navigating(true)
  }
  const move = (event: PointerEvent): void => {
    if (drag?.id !== event.pointerId) return
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y
    moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3
    if (!moved || input.blocked()) return
    runtime.panCameraBy(-dx / drag.scale, -dy / drag.scale)
    x += dx
    y += dy
    input.viewport(x, y)
    drag.x = event.clientX
    drag.y = event.clientY
  }
  const end = (event?: PointerEvent): void => {
    if (!drag || (event && event.pointerId !== drag.id)) return
    const ended = drag
    drag = null
    if (canvas.hasPointerCapture(ended.id)) canvas.releasePointerCapture(ended.id)
    input.navigating(false)
    if (event?.type === 'pointerup' && !moved && !input.blocked())
      input.focus({ x: event.clientX, y: event.clientY })
  }
  const wheel = (event: WheelEvent): void => {
    if (drag || input.blocked() || !input.geometry()) return
    event.preventDefault()
    event.stopPropagation()
    const delta =
      event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1)
    runtime.zoomCameraBy(delta)
  }
  const blur = (): void => {
    end()
  }
  canvas.addEventListener('pointerdown', down)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  canvas.addEventListener('lostpointercapture', end)
  canvas.addEventListener('wheel', wheel, { passive: false })
  window.addEventListener('blur', blur)
  return () => {
    end()
    canvas.removeEventListener('pointerdown', down)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    canvas.removeEventListener('lostpointercapture', end)
    canvas.removeEventListener('wheel', wheel)
    window.removeEventListener('blur', blur)
  }
}
