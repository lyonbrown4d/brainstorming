import type { MindMapDocument } from '@core/types'
import { assertId } from '@core/validation'
import * as v from '@core/extension-validation'

export const INK_LIMITS = {
  strokes: 2000,
  pointsPerStroke: 8192,
  totalPoints: 262144,
  coordinate: 1_000_000,
} as const
export interface CanvasPoint {
  readonly x: number
  readonly y: number
  readonly pressure: number
}
export interface CanvasStroke {
  readonly id: string
  readonly color: string
  readonly width: number
  readonly points: readonly CanvasPoint[]
}
export type DrawingCommand =
  | { readonly type: 'upsertDrawing'; readonly stroke: CanvasStroke }
  | { readonly type: 'removeDrawing'; readonly drawingId: string }

export const validateCanvasStroke: (value: unknown) => asserts value is CanvasStroke = (
  value: unknown,
): asserts value is CanvasStroke => {
  const stroke = v.record(value, ['id', 'color', 'width', 'points'])
  assertId(stroke.id)
  v.text(stroke.id, 128)
  v.color(stroke.color)
  v.number(stroke.width, 1, 24)
  for (const entry of v.list(stroke.points, INK_LIMITS.pointsPerStroke, 1)) {
    const point = v.record(entry, ['x', 'y', 'pressure'])
    v.number(point.x, -INK_LIMITS.coordinate, INK_LIMITS.coordinate)
    v.number(point.y, -INK_LIMITS.coordinate, INK_LIMITS.coordinate)
    v.number(point.pressure, 0, 1)
  }
}

export const validateDrawings: (value: unknown) => asserts value is readonly CanvasStroke[] = (
  value: unknown,
): asserts value is readonly CanvasStroke[] => {
  let count = 0
  const ids = new Set<string>()
  for (const stroke of v.list(value, INK_LIMITS.strokes)) {
    validateCanvasStroke(stroke)
    if (ids.has(stroke.id)) throw new Error('画笔笔画 ID 重复')
    ids.add(stroke.id)
    count += stroke.points.length
    if (count > INK_LIMITS.totalPoints) throw new Error('画笔总点数超过限制')
  }
}

export const applyDrawingCommand = (
  document: MindMapDocument,
  command: DrawingCommand,
): MindMapDocument => {
  const drawings = document.drawings ?? []
  if (command.type === 'removeDrawing') {
    assertId(command.drawingId)
    const next = drawings.filter((stroke) => stroke.id !== command.drawingId)
    return next.length === drawings.length ? document : { ...document, drawings: next }
  }
  validateCanvasStroke(command.stroke)
  const index = drawings.findIndex((stroke) => stroke.id === command.stroke.id)
  if (index >= 0 && JSON.stringify(drawings[index]) === JSON.stringify(command.stroke))
    return document
  const next = [...drawings]
  if (index < 0) next.push(structuredClone(command.stroke))
  else next[index] = structuredClone(command.stroke)
  validateDrawings(next)
  return { ...document, drawings: next }
}
