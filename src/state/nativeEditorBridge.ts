import type { MindMapWorkbook } from '@core'
import type { EditorOperation, NativeEditorSnapshot } from '@shared/compute'
import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useSelection } from '@renderer/state/selection'
import { applyNativeEditorSnapshot } from '@renderer/state/nativeEditorState'
import { queueNativeEditor } from '@renderer/state/nativeEditorQueue'
import { nativeSnapshotSheet } from '@renderer/state/nativeSheetHistory'

interface NativeEditOptions {
  readonly nextSheetId?: string | undefined
  readonly afterAck?: (() => void) | undefined
  readonly onFailure?: (() => void) | undefined
}

const applySnapshot = (
  snapshot: NativeEditorSnapshot,
  previousRevision: string,
  operation: EditorOperation,
  options: NativeEditOptions,
): void => {
  const workbookId = snapshot.workbook.id
  const source =
    useEditor.getState().workbook.id === workbookId
      ? useEditor.getState()
      : useDocumentTabs.getState().tabs.find((tab) => tab.editor.workbook.id === workbookId)?.editor
  if (!source) return
  const nextSheetId = nativeSnapshotSheet(
    snapshot,
    previousRevision,
    operation,
    source.activeSheetId,
    options.nextSheetId,
  )
  let active = false
  if (useEditor.getState().workbook.id === workbookId) {
    active = true
    useEditor.setState((state) => applyNativeEditorSnapshot(state, snapshot, nextSheetId))
    const current = useEditor.getState()
    useSelection.setState((selection) => ({
      sheets: Object.fromEntries(
        Object.entries(selection.sheets)
          .filter(([sheetId]) => current.workbook.sheets.some((sheet) => sheet.id === sheetId))
          .map(([sheetId, ids]) => [
            sheetId,
            ids.filter(
              (id) =>
                current.workbook.sheets.find((sheet) => sheet.id === sheetId)?.document.topics[id],
            ),
          ]),
      ),
      drawings: selection.drawings,
    }))
  }
  useDocumentTabs.setState((state) => ({
    tabs: state.tabs.map((tab) => {
      if (tab.editor.workbook.id !== workbookId) return tab
      const editor =
        active && state.activeId === tab.id
          ? useEditor.getState()
          : {
              ...tab.editor,
              ...applyNativeEditorSnapshot(tab.editor, snapshot, nextSheetId),
            }
      return { ...tab, editor }
    }),
  }))
  options.afterAck?.()
}

export const dispatchNativeEditor = (
  workbook: MindMapWorkbook,
  operation: EditorOperation,
  options: NativeEditOptions = {},
): boolean =>
  queueNativeEditor(
    workbook,
    operation,
    (snapshot, previousRevision) => {
      applySnapshot(snapshot, previousRevision, operation, options)
    },
    (error) => {
      options.onFailure?.()
      if (useEditor.getState().workbook.id === workbook.id) {
        useEditor.getState().setError(error.message)
      }
      useDocumentTabs.setState((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.editor.workbook.id === workbook.id
            ? { ...tab, editor: { ...tab.editor, error: error.message } }
            : tab,
        ),
      }))
    },
    () => {
      if (useEditor.getState().workbook.id === workbook.id) {
        const current = useEditor.getState()
        useEditor.setState({ clock: current.clock + 1 })
      }
      useDocumentTabs.setState((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.editor.workbook.id === workbook.id
            ? { ...tab, editor: { ...tab.editor, clock: tab.editor.clock + 1 } }
            : tab,
        ),
      }))
    },
  )
