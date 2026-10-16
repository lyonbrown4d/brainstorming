import { createDocument, deserializeWorkbook, serializeWorkbook } from '@core'
import type { DesktopAPI, OpenedDocument } from '@shared/contracts'
import { isDirty, useEditor } from './editor'
import { suggestedFileName } from './fileName'
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
function browserOpen(): Promise<OpenedDocument | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.trelyx,.xmind'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      if (file.size > 32 * 1024 * 1024) {
        reject(new Error('文件超过 32 MiB，无法打开'))
        return
      }
      void Promise.all([file.arrayBuffer(), import('../../../formats')])
        .then(([buffer, { decodeFile }]) => {
          const result = decodeFile(new Uint8Array(buffer), file.name)
          resolve({
            path: result.imported ? null : file.name,
            sourcePath: file.name,
            contents: serializeWorkbook(result.workbook),
            warnings: result.warnings,
          })
        })
        .catch(reject)
    }
    input.oncancel = () => {
      resolve(null)
    }
    input.click()
  })
}
function showError(error: unknown): void {
  useEditor.getState().setError(error instanceof Error ? error.message : '文件操作失败，请重试。')
}
export function newDocument(): void {
  if (useEditor.getState().busy || !confirmDiscard()) return
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
    const result = bridge
      ? await (pending
          ? bridge.takeOpenFile()
          : recentPath
            ? bridge.openRecent(recentPath)
            : bridge.openDocument())
      : await browserOpen()
    if (!result) return
    const document = deserializeWorkbook(result.contents)
    const current = useEditor.getState()
    const changedWhileReading =
      current.workbook !== openedFrom.workbook ||
      current.editingId !== openedFrom.editingId ||
      current.editingSurface !== openedFrom.editingSurface ||
      current.draft !== openedFrom.draft
    if (
      changedWhileReading &&
      !window.confirm('读取文件期间，当前导图又有了更改。放弃这些更改并打开文件？')
    )
      return
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
      const { encodeTrelyx } = await import('../../../formats/trelyx')
      const bytes = encodeTrelyx(workbook)
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
export function restoreRecovery(): void {
  const contents = useEditor.getState().recovery
  if (!contents || !confirmDiscard()) return
  try {
    useEditor.getState().replace(deserializeWorkbook(contents), null, true)
    useEditor.setState({ recovery: null })
  } catch (error) {
    showError(error)
  }
}
