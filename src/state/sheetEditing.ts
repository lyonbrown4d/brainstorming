import { translate } from '@renderer/i18n'
import { truncateSheetName } from '@core/workbook'
import { applyWorkbookCommand, type MindMapDocument, type WorkbookCommand } from '@core'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { restoreStructure, sessionFor, snapshot } from '@renderer/state/workbookState'
import { dispatchNativeEditor } from '@renderer/state/nativeEditorBridge'
import { hasNativeEditor } from '@renderer/state/nativeEditorQueue'

export const editSheets = (command: WorkbookCommand, nextId?: string): boolean => {
  const state = useEditor.getState()
  if (usePresentation.getState().playing) return false
  state.commitDraft()
  if (useEditor.getState().editingId) return false
  const current = useEditor.getState()
  if (hasNativeEditor()) {
    const accepted = dispatchNativeEditor(
      current.workbook,
      { kind: 'workbook', command },
      { nextSheetId: nextId },
    )
    if (accepted) useEditor.setState({ clock: current.clock + 1 })
    return accepted
  }
  try {
    const before = snapshot(current)
    const workbook = applyWorkbookCommand(current.workbook, command)
    if (workbook === current.workbook) return true
    const activeSheetId =
      nextId ??
      (workbook.sheets.some((sheet) => sheet.id === current.activeSheetId)
        ? current.activeSheetId
        : workbook.sheets[0]?.id)
    if (!activeSheetId) throw new Error(translate('aWorkbookNeedsAtLeastOneSheet'))
    const sessions = Object.fromEntries(
      workbook.sheets.map((sheet) => [
        sheet.id,
        before.sessions[sheet.id] ?? sessionFor(sheet.document),
      ]),
    )
    const after = { workbook, activeSheetId, sessions }
    useEditor.setState({
      ...restoreStructure(current, after),
      workbook,
      sessions,
      clock: current.clock + 1,
      structurePast: [...current.structurePast, { before, after, order: current.clock + 1 }].slice(
        -100,
      ),
      structureFuture: [],
      error: null,
    })
    return true
  } catch (error) {
    state.setError(error instanceof Error ? error.message : translate('sheetOperationFailed'))
    return false
  }
}

export const addDocumentSheet = (document: MindMapDocument): boolean => {
  if (useEditor.getState().busy) return false
  const id = crypto.randomUUID()
  const name =
    truncateSheetName(document.title.replace(/[\p{Cc}]/gu, ' ').trim()) ||
    translate('newSheetLabel402')
  return editSheets(
    { type: 'addSheet', sheet: { id, name, document: { ...document, id: crypto.randomUUID() } } },
    id,
  )
}
