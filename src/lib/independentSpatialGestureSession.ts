import { independentSpatialInkIdentity } from '@renderer/lib/independentSpatialInkIdentity'
import type { getSpatialView } from '@renderer/state/spatialView'
import type { independentSpatialPointerPlane } from '@renderer/lib/independentSpatialGestureGeometry'
import type { createIndependentSpatialDropFinder } from '@renderer/lib/independentSpatialDrop'
import type { MindMapDocument } from '@core'
import { inkGeometry } from '@shared/ink-geometry'
import { canvasDescendants, canvasMoveCommand, canvasTopicRoots } from '@renderer/lib/canvasGesture'
import type { CanvasDrop } from '@renderer/lib/canvasDrop'
import type {
  IndependentSpatialRuntime,
  SpatialSceneOffset,
  SpatialSceneRect,
} from '@renderer/lib/independentSpatialRuntime'

export const independentSpatialAnchor = (
  runtime: IndependentSpatialRuntime,
  id: string,
): SpatialSceneOffset | null => {
  const node = runtime.model.layout.nodes.find((item) => item.id === id)
  if (node)
    return {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
      z: runtime.model.depths[id] ?? 0,
    }
  const drawingId = independentSpatialInkIdentity(runtime.model.document).byKey.get(id)
  const stroke = runtime.model.document.drawings?.find((item) => item.id === drawingId)
  if (!stroke) return null
  const bounds = inkGeometry(stroke).bounds
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    z: stroke.spatialDepth ?? 0,
  }
}

/** The adapter owns only transient geometry; shared helpers own hierarchy and history rules. */
export const independentSpatialMove = (
  runtime: IndependentSpatialRuntime,
  topics: readonly string[],
  drawings: readonly string[],
) => {
  const document: MindMapDocument = runtime.model.document
  const roots = canvasTopicRoots(document, topics)
  const excluded = new Set([
    ...canvasDescendants(document, roots),
    ...drawings.flatMap((id) => {
      const key = independentSpatialInkIdentity(document).byDrawing.get(id)
      return key ? [key] : []
    }),
  ])
  const origins = new Map(
    runtime.model.layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  )
  const canDrop = !drawings.length && !roots.includes(document.rootId)
  let delta: SpatialSceneOffset = { x: 0, y: 0, z: 0 }
  let finished = false
  return {
    roots,
    excluded,
    canDrop,
    preview: (next: SpatialSceneOffset) => {
      if (finished) return
      delta = next
      for (const id of excluded) runtime.offsets.set(id, next)
      runtime.changed()
    },
    finish: (drop?: CanvasDrop) => {
      if (finished) return undefined
      finished = true
      return canvasMoveCommand(
        document,
        roots,
        drawings,
        origins,
        delta,
        canDrop ? drop : undefined,
      )
    },
    cancel: () => {
      finished = true
      for (const id of excluded) if (runtime.offsets.get(id) === delta) runtime.offsets.delete(id)
      runtime.dropTarget = null
      runtime.changed()
    },
  }
}

export interface IndependentSpatialPointerSession {
  pointer: number
  start: { x: number; y: number }
  document: MindMapDocument
  workbook: string
  sheet: string
  view: ReturnType<typeof getSpatialView>
  rectangles: SpatialSceneRect[]
  topics: readonly string[]
  drawings: readonly string[]
  move: ReturnType<typeof independentSpatialMove> | null
  plane: ReturnType<typeof independentSpatialPointerPlane> | null
  anchor: ReturnType<ReturnType<typeof independentSpatialPointerPlane>>
  rect: SpatialSceneRect | null
  find: ReturnType<typeof createIndependentSpatialDropFinder> | null
  token: symbol | null
  dragged: boolean
  singlePick: boolean
}

/** A click narrows selection only after a non-drag gesture; group grabs preserve it. */
export const independentSpatialClickSelection = (active: IndependentSpatialPointerSession) => {
  if (active.dragged || !active.singlePick || !active.rect) return null
  return active.rect.kind === 'topic'
    ? { topics: [active.rect.id], drawings: [] }
    : { topics: [], drawings: [active.rect.drawingId] }
}
