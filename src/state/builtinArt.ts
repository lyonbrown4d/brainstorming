import { applyCommand, validateWorkbook } from '@core'
import { imageDimensions } from '@assets'
import { parseBuiltinArtAsset } from '@shared/builtinArt'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { translate } from '@renderer/i18n'
import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'

export const insertBuiltinArt = async (topicId: string, id: string): Promise<boolean> => {
  const state = useEditor.getState()
  if (state.busy) return false
  state.commitDraft()
  if (useEditor.getState().editingId || !state.history.document.topics[topicId]) return false
  const workbookId = state.workbook.id
  const documentId = state.history.document.id
  const sheetId = state.activeSheetId
  const tabId = useDocumentTabs.getState().activeId
  const request = { stale: false }
  const unsubscribe = useEditor.subscribe((next) => {
    if (
      next.workbook.id !== workbookId ||
      next.activeSheetId !== sheetId ||
      next.history.document.id !== documentId ||
      !next.history.document.topics[topicId]
    )
      request.stale = true
  })
  const unsubscribeTabs = useDocumentTabs.subscribe((next) => {
    if (next.activeId !== tabId) request.stale = true
  })
  useEditor.setState({ busy: true, error: null })
  try {
    const asset = parseBuiltinArtAsset(await requireDesktopAPI().getBuiltinArt(id))
    const current = useEditor.getState()
    if (request.stale) return false
    const command = { type: 'setTopicImage' as const, topicId, asset, ...imageDimensions(asset) }
    const candidate = applyCommand(current.history.document, command)
    validateWorkbook({
      ...current.workbook,
      sheets: current.workbook.sheets.map((sheet) =>
        sheet.id === sheetId ? { ...sheet, document: candidate } : sheet,
      ),
    })
    return current.command(command)
  } catch (error) {
    if (!request.stale)
      useEditor
        .getState()
        .setError(error instanceof Error ? error.message : translate('builtinArtFailed'))
    return false
  } finally {
    unsubscribe()
    unsubscribeTabs()
    useEditor.setState({ busy: false })
  }
}
