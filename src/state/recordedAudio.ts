import { validateWorkbook } from '@core'
import { translate } from '@renderer/i18n'
import { applyCommand } from '@core'
import { useEditor } from '@renderer/state/editor'

export interface RecordingTarget {
  readonly workbookId: string
  readonly sheetId: string
  readonly topicId: string
}
export const persistRecordedAudio = async (
  blob: Blob,
  target: RecordingTarget,
  isCurrent: () => boolean,
): Promise<boolean> => {
  if (!blob.size || blob.size > 8 * 1024 * 1024)
    throw new Error(translate('recordingIsEmptyOrExceeds8Mib'))
  const [{ createAsset }, buffer] = await Promise.all([import('@assets'), blob.arrayBuffer()])
  const current = useEditor.getState()
  if (
    !isCurrent() ||
    current.workbook.id !== target.workbookId ||
    current.activeSheetId !== target.sheetId ||
    current.selectedId !== target.topicId ||
    !current.history.document.topics[target.topicId]
  )
    return false
  const mime = blob.type.split(';')[0] ?? ''
  const extensions: Readonly<Record<string, string>> = {
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
  }
  const asset = createAsset(
    new Uint8Array(buffer),
    `录音-${Date.now()}.${extensions[mime] ?? 'webm'}`,
  )
  if (!asset.mimeType.startsWith('audio/'))
    throw new Error(translate('unrecognizedRecordingFormatYouCanImportA'))
  const command = { type: 'setTopicAudio' as const, topicId: target.topicId, asset }
  const candidate = applyCommand(current.history.document, command)
  validateWorkbook({
    ...current.workbook,
    sheets: current.workbook.sheets.map((sheet) =>
      sheet.id === target.sheetId ? { ...sheet, document: candidate } : sheet,
    ),
  })
  return isCurrent() && current.command(command)
}
