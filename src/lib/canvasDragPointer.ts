interface ClientPointer {
  readonly clientX: number
  readonly clientY: number
}
type DragPointerEvent =
  | ClientPointer
  | {
      readonly touches: ArrayLike<ClientPointer>
      readonly changedTouches: ArrayLike<ClientPointer>
    }

/** Client coordinates keep targeting aligned with the grab point, including a final touch release. */
export const canvasDragPointer = (
  event: DragPointerEvent,
): { x: number; y: number } | undefined => {
  const pointer = 'touches' in event ? (event.touches[0] ?? event.changedTouches[0]) : event
  return pointer ? { x: pointer.clientX, y: pointer.clientY } : undefined
}
