import { createDocument, deserializeWorkbook } from '@core'
import type { DesktopAPI } from '@shared/contracts'
import { isDirty, useEditor } from './editor'
import { suggestedFileName } from './fileName'
import { browserOpen, adoptBrowserPassword, cancelBrowserPassword } from './browserFiles'
import { activateOpenedDocument, cancelOpenedDocument, unlockOpenedDocument } from './lockedFiles'
import { browserPasswordFor, resetBrowserPassword } from './password'
import { serializedWorkbook } from './workbookState'
export { RECOVERY_KEY } from './recovery'

declare global {
  interface Window {
    trelyx?: DesktopAPI
  }
}

function confirmDiscard(): boolean {
  useEditor.getState().commitDraft()
  return !isDirty() || window.confirm('当前导图有未保存的更改。放弃这些更改并继续？')
}
function showError(error: unknown): void {
  useEditor.getState().setError(error instanceof Error ? error.message : '文件操作失败，请重试。')
}
export function newDocument(): void {
  if (useEditor.getState().busy || !confirmDiscard()) return
  resetBrowserPassword()
  useEditor.getState().replace(createDocument('新的想法'))
}
export async function openDocument(recentPath?: string, pending = false): Promise<void> {
  if (useEditor.getState().busy) return
  if (pending) {
    try {
      if (!(await window.trelyx?.hasOpenFile())) return
    } catch (error) {
      showError(error)
      return
    }
  }
  if (useEditor.getState().busy || !confirmDiscard()) return
  const openedFrom = useEditor.getState()
  useEditor.setState({ busy: true })
  try {
    const bridge = window.trelyx
    const selected = bridge
      ? await (pending
          ? bridge.takeOpenFile()
          : recentPath
            ? bridge.openRecent(recentPath)
            : bridge.openDocument())
      : await browserOpen()
    if (!selected) return
    const result = await unlockOpenedDocument(selected)
    if (!result) return
    const document = deserializeWorkbook(result.contents)
    const current = useEditor.getState()
    const changedWhileReading =
      current.workbook !== openedFrom.workbook ||
      current.editingId !== openedFrom.editingId ||
      current.editingSurface !== openedFrom.editingSurface ||
      current.draft !== openedFrom.draft ||
      current.richDraft !== openedFrom.richDraft
    if (
      changedWhileReading &&
      !window.confirm('读取文件期间，当前导图又有了更改。放弃这些更改并打开文件？')
    ) {
      await cancelOpenedDocument(result)
      cancelBrowserPassword()
      return
    }
    await activateOpenedDocument(result)
    if (!bridge && result.encrypted) adoptBrowserPassword(document.id)
    const imported = result.path === null
    current.replace(document, result.path, imported)
    if (imported)
      useEditor.setState({
        importReport: {
          sourceName: result.sourcePath?.split(/[\\/]/u).at(-1) ?? 'XMind 文件',
          warnings: result.warnings ?? [],
        },
      })
  } catch (error) {
    showError(error)
  } finally {
    useEditor.setState({ busy: false })
  }
}
export async function saveDocument(saveAs = false): Promise<void> {
  if (useEditor.getState().busy) return
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  const { workbook, path } = useEditor.getState()
  const contents = serializedWorkbook(workbook)
  useEditor.setState({ busy: true, error: null })
  try {
    let savedPath: string | null
    if (window.trelyx) {
      savedPath = await window.trelyx.saveDocument({
        path: saveAs ? null : path,
        contents,
        suggestedName: suggestedFileName(workbook.title),
      })
    } else {
      const password = browserPasswordFor(workbook.id)
      const bytes =
        password === null
          ? (await import('../../../formats/trelyx')).encodeTrelyx(workbook)
          : await (
              await import('../../../formats/encrypted')
            ).encryptTrelyx(workbook, password, 'existing')
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer], { type: 'application/vnd.trelyx+zip' }),
      )
      const link = window.document.createElement('a')
      link.href = url
      link.download = suggestedFileName(workbook.title)
      link.click()
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
      savedPath = link.download
    }
    if (savedPath && useEditor.getState().workbook.id === workbook.id)
      useEditor.setState({ baseline: contents, path: savedPath })
  } catch (error) {
    showError(error)
  } finally {
    useEditor.setState({ busy: false })
  }
}
export {
  restoreRecovery,
  readRecoveryContents,
  retryRecovery,
  restoreBackup,
  changeFilePassword,
} from './fileSecurityActions'
