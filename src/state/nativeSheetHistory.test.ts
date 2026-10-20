import { afterEach, expect, it, vi } from 'vitest'
import { applyCommand, applyWorkbookCommand, type MindMapWorkbook } from '@core'
import type { ComputeAPI, EditorOperation, NativeEditorSnapshot } from '@shared/compute'

const platform = vi.hoisted(() => ({ compute: null as ComputeAPI | null }))
vi.mock('@renderer/lib/desktop', () => ({ getPlatformAPI: () => ({ compute: platform.compute }) }))

import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { loadWorkbook } from '@renderer/state/workbookState'
import { flushNativeEditor, forgetNativeEditor } from '@renderer/state/nativeEditorQueue'

const opened: string[] = []
afterEach(() => {
  platform.compute = null
  for (const id of opened.splice(0)) forgetNativeEditor(id)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
})

/** The backend stub applies the TS reference model; only Sheet focus is under test here. */
const installEngine = (id: string): void => {
  let current: MindMapWorkbook = {
    format: 'brainstorming',
    version: 2,
    id,
    title: 'Map',
    sheets: [
      {
        id: 'first',
        name: 'First',
        document: {
          format: 'brainstorming',
          version: 1,
          id: 'first',
          title: 'Root',
          rootId: 'root',
          topics: {
            root: { id: 'root', title: 'Root', children: [], collapsed: false, side: 'right' },
          },
        },
      },
    ],
  }
  let revision = 0
  const past: MindMapWorkbook[] = []
  const future: MindMapWorkbook[] = []
  const snapshot = (): NativeEditorSnapshot => ({
    sessionId: id,
    revision: String(revision),
    workbook: current,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  })
  platform.compute = {
    openSession: () => Promise.resolve(snapshot()),
    executeSession: (_id: string, _revision: string, operation: EditorOperation) => {
      let next = current
      if (operation.kind === 'undo') {
        const previous = past.pop()
        if (previous) {
          future.push(current)
          next = previous
        }
      } else if (operation.kind === 'redo') {
        const following = future.pop()
        if (following) {
          past.push(current)
          next = following
        }
      } else {
        switch (operation.kind) {
          case 'workbook':
            next = applyWorkbookCommand(current, operation.command)
            break
          case 'topic': {
            const { command, sheetId } = operation
            next = {
              ...current,
              sheets: current.sheets.map((sheet) =>
                sheet.id === sheetId
                  ? { ...sheet, document: applyCommand(sheet.document, command) }
                  : sheet,
              ),
            }
            break
          }
        }
        if (next !== current) {
          past.push(current)
          future.length = 0
        }
      }
      if (next !== current) {
        current = next
        revision += 1
      }
      return Promise.resolve(snapshot())
    },
    closeSession: () => Promise.resolve(),
  } as unknown as ComputeAPI
  useEditor.setState({ ...loadWorkbook(current), editingId: null, error: null })
  opened.push(id)
}

it('reactivates an added Sheet on redo without recording unrelated no-op commands', async () => {
  installEngine('sheet-add-focus')
  useEditor.getState().addSheet()
  await flushNativeEditor('sheet-add-focus')
  const addedId = useEditor.getState().activeSheetId
  expect(addedId).not.toBe('first')
  useEditor.getState().switchSheet('first')
  useEditor.getState().renameSheet('first', 'First')
  await flushNativeEditor('sheet-add-focus')
  useEditor.getState().undo()
  await flushNativeEditor('sheet-add-focus')
  expect(useEditor.getState().workbook.sheets).toHaveLength(1)
  expect(useEditor.getState().activeSheetId).toBe('first')
  useEditor.getState().redo()
  await flushNativeEditor('sheet-add-focus')
  expect(useEditor.getState().workbook.sheets).toHaveLength(2)
  expect(useEditor.getState().activeSheetId).toBe(addedId)
})

it('returns to a deleted active Sheet on undo and its surviving neighbor on redo', async () => {
  installEngine('sheet-delete-focus')
  useEditor.getState().addSheet()
  await flushNativeEditor('sheet-delete-focus')
  const deletedId = useEditor.getState().activeSheetId
  useEditor.getState().deleteSheet(deletedId)
  await flushNativeEditor('sheet-delete-focus')
  expect(useEditor.getState().activeSheetId).toBe('first')
  useEditor.getState().undo()
  await flushNativeEditor('sheet-delete-focus')
  expect(useEditor.getState().activeSheetId).toBe(deletedId)
  useEditor.getState().redo()
  await flushNativeEditor('sheet-delete-focus')
  expect(useEditor.getState().activeSheetId).toBe('first')
  expect(useEditor.getState().workbook.sheets.some((sheet) => sheet.id === deletedId)).toBe(false)
})

it('keeps manually selected Sheet focus when undoing a topic content command', async () => {
  installEngine('sheet-content-focus')
  useEditor.getState().addSheet()
  await flushNativeEditor('sheet-content-focus')
  const addedId = useEditor.getState().activeSheetId
  useEditor.getState().command({
    type: 'renameTopic',
    topicId: useEditor.getState().history.document.rootId,
    title: 'Edited',
  })
  await flushNativeEditor('sheet-content-focus')
  useEditor.getState().switchSheet('first')
  useEditor.getState().undo()
  await flushNativeEditor('sheet-content-focus')
  expect(useEditor.getState().activeSheetId).toBe('first')
  expect(
    useEditor.getState().workbook.sheets.find((sheet) => sheet.id === addedId)?.document.title,
  ).not.toBe('Edited')
  useEditor.getState().undo()
  await flushNativeEditor('sheet-content-focus')
  useEditor.getState().redo()
  await flushNativeEditor('sheet-content-focus')
  expect(useEditor.getState().activeSheetId).toBe(addedId)
})
