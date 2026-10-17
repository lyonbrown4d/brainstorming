import { create } from 'zustand'
import type { DocumentBackup } from '@shared/fileSecurity'
import { useEditor } from '@renderer/state/editor'
export const useFileDialogs = create<{
  security: boolean
  history: boolean
  historyLoading: boolean
  historyError: string | null
  backups: readonly DocumentBackup[]
}>(() => ({
  security: false,
  history: false,
  historyLoading: false,
  historyError: null,
  backups: [],
}))
let historyRequest = 0
export const openHistoryDialog = async (): Promise<void> => {
  historyRequest += 1
  const request = historyRequest
  const documentId = useEditor.getState().workbook.id
  useFileDialogs.setState({ history: true, historyLoading: true, historyError: null, backups: [] })
  try {
    const backups = (await window.trelyx?.listDocumentBackups(documentId)) ?? []
    if (request !== historyRequest) return
    if (useEditor.getState().workbook.id !== documentId)
      throw new Error('当前文档已更改，请重新打开版本历史')
    useFileDialogs.setState({ backups })
  } catch (error) {
    if (request !== historyRequest) return
    useFileDialogs.setState({
      historyError: error instanceof Error ? error.message : '无法读取版本历史',
    })
  } finally {
    if (request === historyRequest) useFileDialogs.setState({ historyLoading: false })
  }
}
