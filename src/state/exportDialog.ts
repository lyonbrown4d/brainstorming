import { create } from 'zustand'
import { printSheet } from '@renderer/export/print'
import { flushNativeEditor } from '@renderer/state/nativeEditorQueue'
import { useEditor } from '@renderer/state/editor'

interface ExportDialogState {
  readonly open: boolean
  readonly workbookId: string | null
  openFor: (workbookId: string) => void
  close: () => void
}

export const useExportDialog = create<ExportDialogState>((set) => ({
  open: false,
  workbookId: null,
  openFor: (workbookId) => {
    set({ open: true, workbookId })
  },
  close: () => {
    set({ open: false, workbookId: null })
  },
}))

export const runNativeExportMenuAction = async (action: 'export' | 'print'): Promise<void> => {
  const editor = useEditor.getState()
  editor.commitDraft()
  const current = useEditor.getState()
  if (current.editingId) return
  if (action === 'export') {
    useExportDialog.getState().openFor(current.workbook.id)
    return
  }
  try {
    await flushNativeEditor(current.workbook.id)
    const latest = useEditor.getState()
    if (latest.workbook.id !== current.workbook.id) return
    const sheet = latest.workbook.sheets.find((item) => item.id === latest.activeSheetId)
    if (!sheet) throw new Error('当前画布不存在。')
    await printSheet(sheet.document)
  } catch (error) {
    useEditor.getState().setError(error instanceof Error ? error.message : String(error))
  }
}
