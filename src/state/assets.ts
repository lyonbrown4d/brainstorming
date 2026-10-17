import { validateWorkbook } from '@core'
import { translate } from '@renderer/i18n'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { applyCommand, type DocumentAsset } from '@core'
import { useEditor } from '@renderer/state/editor'

export const importTopicAssets = async (
  topicId: string,
  kind: 'image' | 'attachment' | 'audio',
): Promise<void> => {
  const state = useEditor.getState()
  if (state.busy) return
  state.commitDraft()
  if (useEditor.getState().editingId) return
  const workbookId = state.workbook.id
  const sheetId = state.activeSheetId
  useEditor.setState({ busy: true, error: null })
  try {
    const asset = await requireDesktopAPI().selectAsset(kind)
    if (!asset) return
    const { imageDimensions } = await import('@assets')
    const current = useEditor.getState()
    if (
      current.workbook.id !== workbookId ||
      current.activeSheetId !== sheetId ||
      !current.history.document.topics[topicId]
    )
      throw new Error(translate('theTopicChangedOrWasDeletedAdd'))
    const command =
      kind === 'image'
        ? { type: 'setTopicImage' as const, topicId, asset, ...imageDimensions(asset) }
        : kind === 'audio'
          ? { type: 'setTopicAudio' as const, topicId, asset }
          : { type: 'addTopicAttachment' as const, topicId, asset }
    const candidate = applyCommand(current.history.document, command)
    // A successful insert must remain representable by the native writer.
    validateWorkbook({
      ...current.workbook,
      sheets: current.workbook.sheets.map((sheet) =>
        sheet.id === sheetId ? { ...sheet, document: candidate } : sheet,
      ),
    })
    current.command(command)
  } catch (error) {
    useEditor
      .getState()
      .setError(error instanceof Error ? error.message : translate('couldNotAddResource'))
  } finally {
    useEditor.setState({ busy: false })
  }
}

export const exportTopicAsset = async (asset: DocumentAsset): Promise<void> => {
  if (useEditor.getState().busy) return
  useEditor.setState({ busy: true, error: null })
  try {
    await requireDesktopAPI().exportAsset(asset)
  } catch (error) {
    useEditor
      .getState()
      .setError(error instanceof Error ? error.message : translate('couldNotSaveAttachment'))
  } finally {
    useEditor.setState({ busy: false })
  }
}
