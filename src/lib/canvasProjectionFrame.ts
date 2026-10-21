import type { MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import type { createCanvasProjector } from '@renderer/lib/canvasProjection'

type Projector = ReturnType<typeof createCanvasProjector>
interface FrameBase {
  readonly scopeId: string
  readonly pending: boolean
  readonly refreshGeometry: boolean
  readonly document: MindMapDocument
  readonly layout: MindMapLayout
  readonly depths?: Readonly<Record<string, number>> | undefined
}
export type CanvasProjectionFrame =
  | (FrameBase & { readonly phase: '2d'; readonly projection: ReturnType<Projector> })
  | (FrameBase & { readonly phase: '3d' })
interface FrameSource {
  readonly scopeId: string
  readonly document: MindMapDocument
  readonly layout: MindMapLayout | undefined
  readonly depths?: Readonly<Record<string, number>> | undefined
  readonly placeholder: boolean
  readonly surface: string | undefined
  readonly deferProjection?: boolean
}

/** Placeholder geometry must never be combined with the next document's node data. */
export const completeCanvasFrame = (
  previous: CanvasProjectionFrame | null,
  source: FrameSource,
  project: Projector,
): CanvasProjectionFrame | null => {
  const phase = source.deferProjection ? '3d' : '2d'
  if (!source.layout || source.placeholder) {
    if (previous?.scopeId !== source.scopeId || previous.phase !== phase) return null
    return previous.pending ? previous : { ...previous, pending: true }
  }
  if (phase === '3d') {
    if (
      previous?.phase === '3d' &&
      previous.scopeId === source.scopeId &&
      !previous.pending &&
      previous.document === source.document &&
      previous.layout === source.layout &&
      previous.depths === source.depths
    )
      return previous
    return {
      phase: '3d',
      scopeId: source.scopeId,
      pending: false,
      refreshGeometry:
        previous?.phase === '3d' && previous.scopeId === source.scopeId && previous.pending,
      document: source.document,
      layout: source.layout,
      ...(source.depths ? { depths: source.depths } : {}),
    }
  }
  // Undo may return to a cached document before its intermediate layout finishes.
  // A fresh node array is still needed to reconcile pointer-owned size/position fields.
  const projection = project(
    source.document,
    source.layout,
    source.surface,
    previous?.pending === true,
  )
  return previous?.phase === '2d' &&
    previous.scopeId === source.scopeId &&
    !previous.pending &&
    previous.document === source.document &&
    previous.layout === source.layout &&
    previous.projection === projection &&
    previous.depths === source.depths
    ? previous
    : {
        phase: '2d',
        scopeId: source.scopeId,
        pending: false,
        refreshGeometry: false,
        document: source.document,
        layout: source.layout,
        projection,
        ...(source.depths ? { depths: source.depths } : {}),
      }
}

/** A retained frame can be shown during refresh, but its old depths cannot own a new gesture. */
export const spatialFrameReady = (
  frame: CanvasProjectionFrame | null,
  placeholder: boolean,
  pending: boolean,
): boolean =>
  Boolean(frame?.phase === '3d' && frame.depths && !frame.pending && !placeholder && !pending)
