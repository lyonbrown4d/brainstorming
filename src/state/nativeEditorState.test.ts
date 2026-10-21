import { expect, it } from 'vitest'
import { createDocument, createWorkbook, type CanvasStroke, type MindMapDocument } from '@core'
import type { NativeEditorSnapshot } from '@shared/compute'
import { useEditor } from '@renderer/state/editor'
import type { EditorState } from '@renderer/state/editorTypes'
import { applyNativeEditorSnapshot } from '@renderer/state/nativeEditorState'
import { loadWorkbook } from '@renderer/state/workbookState'

const stroke = (id: string, x: number): CanvasStroke => ({
  id,
  color: '#123456',
  width: 4,
  points: [
    { x, y: 20, pressure: 0.5 },
    { x: x + 12, y: 30, pressure: 0.75 },
  ],
  transform: { x: 4, y: 6, scaleX: 1, scaleY: 1 },
})

it('shares unchanged native drawing objects across camera edits, but reflects edits and order', () => {
  const initial: MindMapDocument = {
    ...createDocument('Ink', 'native-ink-sharing'),
    drawings: [stroke('a', 10), stroke('b', 50)],
  }
  let state: EditorState = { ...useEditor.getState(), ...loadWorkbook(createWorkbook(initial)) }
  const before = state.history.document.drawings
  expect(before).toHaveLength(2)
  const originalA = before?.[0]
  const originalB = before?.[1]
  expect(originalA).toBeDefined()
  expect(originalB).toBeDefined()

  let revision = 0
  const apply = (document: MindMapDocument): readonly CanvasStroke[] => {
    const workbook = {
      ...state.workbook,
      sheets: state.workbook.sheets.map((sheet) => ({ ...sheet, document })),
    }
    const snapshot: NativeEditorSnapshot = {
      sessionId: workbook.id,
      revision: String(++revision),
      workbook,
      canUndo: true,
      canRedo: false,
    }
    state = { ...state, ...applyNativeEditorSnapshot(state, snapshot) }
    return state.history.document.drawings ?? []
  }

  const camera: MindMapDocument = {
    ...structuredClone(state.history.document),
    settings: { spatial: { mode: '3d', yaw: 1.1, pitch: 0.4, spacing: 100 } },
  }
  const afterCamera = apply(camera)
  expect(afterCamera).toBe(before)
  expect(afterCamera[0]).toBe(originalA)
  expect(afterCamera[0]?.points).toBe(originalA?.points)
  expect(afterCamera[0]?.transform).toBe(originalA?.transform)
  expect(afterCamera[1]).toBe(originalB)

  const changed: MindMapDocument = {
    ...structuredClone(camera),
    drawings: [stroke('a', 10), { ...stroke('b', 50), width: 8 }],
  }
  const afterChange = apply(changed)
  expect(afterChange).not.toBe(afterCamera)
  expect(afterChange[0]).toBe(originalA)
  expect(afterChange[1]).not.toBe(originalB)
  expect(afterChange[1]?.width).toBe(8)
  const updatedB = afterChange[1]

  const reordered: MindMapDocument = {
    ...structuredClone(changed),
    drawings: [stroke('b', 50), stroke('a', 10)].map((entry) =>
      entry.id === 'b' ? { ...entry, width: 8 } : entry,
    ),
  }
  const afterReorder = apply(reordered)
  expect(afterReorder).not.toBe(afterChange)
  expect(afterReorder.map((entry) => entry.id)).toEqual(['b', 'a'])
  expect(afterReorder[0]).toBe(updatedB)
  expect(afterReorder[1]).toBe(originalA)

  const removed: MindMapDocument = {
    ...structuredClone(reordered),
    drawings: [{ ...stroke('b', 50), width: 8 }],
  }
  const afterRemove = apply(removed)
  expect(afterRemove.map((entry) => entry.id)).toEqual(['b'])
  expect(afterRemove[0]).toBe(updatedB)
})
