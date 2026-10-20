import type { MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import type { createCanvasProjector } from '@renderer/lib/canvasProjection'

type Projector = ReturnType<typeof createCanvasProjector>
export interface CanvasProjectionFrame {
  readonly scopeId: string
  readonly pending: boolean
  readonly projection: ReturnType<Projector>
}
interface FrameSource {
  readonly scopeId: string
  readonly document: MindMapDocument
  readonly layout: MindMapLayout | undefined
  readonly placeholder: boolean
  readonly surface: string | undefined
}

/** Placeholder geometry must never be combined with the next document's node data. */
export const completeCanvasFrame = (
  previous: CanvasProjectionFrame | null,
  source: FrameSource,
  project: Projector,
): CanvasProjectionFrame | null => {
  if (!source.layout || source.placeholder) {
    if (previous?.scopeId !== source.scopeId) return null
    return previous.pending ? previous : { ...previous, pending: true }
  }
  // Undo may return to a cached document before its intermediate layout finishes.
  // A fresh node array is still needed to reconcile pointer-owned size/position fields.
  const projection = project(
    source.document,
    source.layout,
    source.surface,
    previous?.pending === true,
  )
  return previous?.scopeId === source.scopeId &&
    !previous.pending &&
    previous.projection === projection
    ? previous
    : { scopeId: source.scopeId, pending: false, projection }
}
