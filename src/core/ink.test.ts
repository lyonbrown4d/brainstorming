import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  applyWorkbookCommand,
  createDocument,
  createHistory,
  createTopicClipboard,
  createWorkbook,
  deserializeDocument,
  deserializeWorkbook,
  executeCommand,
  INK_LIMITS,
  redo,
  serializeDocument,
  serializeWorkbook,
  undo,
  validateDrawings,
  type CanvasStroke,
} from '@core'

const stroke: CanvasStroke = {
  id: 'ink-a',
  color: '#123abc',
  width: 4,
  points: [
    { x: -500, y: 20, pressure: 0.5 },
    { x: 100, y: 200, pressure: 1 },
  ],
}

describe('same-sheet drawing document commands', () => {
  it('inserts/replaces/removes stable strokes with one undo per command and isolated snapshot data', () => {
    const before = createHistory(createDocument('Map'))
    const first = executeCommand(before, { type: 'upsertDrawing', stroke })
    expect(first.document.drawings).toEqual([stroke])
    expect(first.document.drawings?.[0]?.points).not.toBe(stroke.points)
    expect(first.past).toHaveLength(1)
    expect(executeCommand(first, { type: 'upsertDrawing', stroke })).toBe(first)
    const updated = executeCommand(first, {
      type: 'upsertDrawing',
      stroke: { ...stroke, color: '#abcdef' },
    })
    expect(updated.document.drawings).toHaveLength(1)
    expect(updated.document.drawings?.[0]?.color).toBe('#abcdef')
    const removed = executeCommand(updated, { type: 'removeDrawing', drawingId: stroke.id })
    expect(removed.document.drawings).toEqual([])
    expect(undo(removed).document).toBe(updated.document)
    expect(redo(undo(removed)).document.drawings).toEqual([])
    expect(applyCommand(removed.document, { type: 'removeDrawing', drawingId: 'missing' })).toBe(
      removed.document,
    )
  })

  it('preserves drawings in native snapshot protocol and sheet duplication while topic clipboard stays scoped', () => {
    const spatialStroke = { ...stroke, spatialDepth: -1_000_000 }
    const document = applyCommand(createDocument('Map'), {
      type: 'upsertDrawing',
      stroke: spatialStroke,
    })
    expect(deserializeDocument(serializeDocument(document)).drawings).toEqual([spatialStroke])
    const workbook = applyWorkbookCommand(createWorkbook(document), {
      type: 'duplicateSheet',
      sheetId: document.id,
      id: 'copy',
    })
    expect(
      deserializeWorkbook(serializeWorkbook(workbook)).sheets.map(
        (sheet) => sheet.document.drawings,
      ),
    ).toEqual([[spatialStroke], [spatialStroke]])
    expect(workbook.sheets[1]?.document.drawings).not.toBe(workbook.sheets[0]?.document.drawings)
    expect(createTopicClipboard(document, ['root'])).not.toHaveProperty('drawings')
  })

  it('rejects malformed strokes, duplicate IDs and nonfinite/unbounded points before changing content', () => {
    for (const patch of [
      { width: 0 },
      { width: 25 },
      { color: 'red' },
      { points: [] },
      { points: [{ x: Infinity, y: 0, pressure: 0.5 }] },
      { points: [{ x: 0, y: 0, pressure: 1.1 }] },
      { points: [{ x: 1_000_001, y: 0, pressure: 0.5 }] },
      { spatialDepth: -1_000_001 },
      { spatialDepth: Number.NaN },
      { unknown: true },
    ])
      expect(() => {
        validateDrawings([{ ...stroke, ...patch }])
      }).toThrow()
    expect(() => {
      validateDrawings([stroke, stroke])
    }).toThrow()
    expect(() => {
      validateDrawings([
        {
          ...stroke,
          points: Array.from({ length: INK_LIMITS.pointsPerStroke + 1 }, () => stroke.points[0]),
        },
      ])
    }).toThrow()
    expect(() => {
      validateDrawings(
        Array.from({ length: INK_LIMITS.strokes + 1 }, (_, index) => ({
          ...stroke,
          id: String(index),
        })),
      )
    }).toThrow()
    const points = Array.from({ length: INK_LIMITS.pointsPerStroke }, () => ({
      x: 0,
      y: 0,
      pressure: 0.5,
    }))
    const maximum = Array.from({ length: 32 }, (_, index) => ({
      ...stroke,
      id: String(index),
      points,
    }))
    expect(() => {
      validateDrawings(maximum)
    }).not.toThrow()
    expect(() => {
      validateDrawings([...maximum, { ...stroke, id: 'overflow' }])
    }).toThrow()
  })
})
