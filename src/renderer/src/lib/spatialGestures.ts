interface SpatialWheelInput {
  readonly deltaX: number
  readonly deltaY: number
  readonly deltaMode: number
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

interface GestureViewport {
  readonly width: number
  readonly height: number
}

export interface SpatialWheelGesture {
  readonly kind: 'pan' | 'dolly' | 'rotate'
  readonly x: number
  readonly y: number
}

/** Normalize the browser wheel contract without guessing the user's input device. */
export function spatialWheelGesture(
  event: SpatialWheelInput,
  viewport: GestureViewport,
): SpatialWheelGesture | null {
  if (
    !Number.isFinite(event.deltaX) ||
    !Number.isFinite(event.deltaY) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    ![0, 1, 2].includes(event.deltaMode)
  )
    return null
  const scaleX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.width : 1
  const scaleY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1
  const clamp = (delta: number): number => Math.max(-240, Math.min(240, delta))
  let x = clamp(event.deltaX * scaleX)
  let y = clamp(event.deltaY * scaleY)
  // Some browsers already put Shift+wheel on deltaX; only translate the unmapped case.
  if (event.shiftKey && x === 0 && !event.ctrlKey) {
    x = y
    y = 0
  }
  if (x === 0 && y === 0) return null
  return { kind: event.ctrlKey ? 'dolly' : event.altKey ? 'rotate' : 'pan', x, y }
}
