import { deserializeWorkbook } from '@core'
import type { OpenedDocument } from '@shared/contracts'
import { isDirty, useEditor } from './editor'
import { activateOpenedDocument, cancelOpenedDocument, unlockOpenedDocument } from './lockedFiles'
import { browserPasswordFor, setBrowserPassword, useFileSecurityState } from './password'
import {
  adoptBrowserRecoveryPassword,
  protectBrowserRecovery,
  readBrowserRecovery,
} from './recovery'

let pendingRecovery: OpenedDocument | null = null
function showError(error: unknown): void {
  useEditor.getState().setError(error instanceof Error ? error.message : '文件操作失败')
}
export async function readRecoveryContents(): Promise<string | null> {
  if (!window.trelyx) return readBrowserRecovery()
  const opened = await window.trelyx.readLockedRecovery()
  if (!opened) return null
  const result = await unlockOpenedDocument(opened, '解锁自动恢复记录')
  if (!result) {
    useFileSecurityState.setState({ lockedRecovery: true })
    throw new Error('加密恢复记录已保留，可稍后重试解锁')
  }
  pendingRecovery = result
  useFileSecurityState.setState({ lockedRecovery: false })
  return result.contents
}
export async function changeFilePassword(password: string | null): Promise<void> {
  const state = useEditor.getState()
  if (state.busy) return
  state.commitDraft()
  if (useEditor.getState().editingId) throw new Error('请先完成当前主题编辑')
  const documentId = useEditor.getState().workbook.id
  useEditor.setState({ busy: true })
  try {
    if (window.trelyx) {
      const security = await window.trelyx.setFilePassword(documentId, password)
      useFileSecurityState.setState({ documentId, encrypted: security.encrypted })
    } else {
      const previous = browserPasswordFor(documentId)
      setBrowserPassword(documentId, password)
      try {
        await protectBrowserRecovery(documentId, previous, password)
      } catch (error) {
        setBrowserPassword(documentId, previous, true)
        throw error
      }
    }
    useEditor.setState({ baseline: '', error: null })
  } finally {
    useEditor.setState({ busy: false })
  }
}
export function restoreRecovery(): void {
  const contents = useEditor.getState().recovery
  if (!contents || useEditor.getState().busy) return
  useEditor.getState().commitDraft()
  if (isDirty() && !window.confirm('当前导图有未保存的更改。放弃这些更改并恢复草稿？')) return
  useEditor.setState({ busy: true })
  void (async () => {
    try {
      const workbook = deserializeWorkbook(contents)
      if (pendingRecovery) await activateOpenedDocument(pendingRecovery)
      else adoptBrowserRecoveryPassword(workbook.id)
      useEditor.getState().replace(workbook, null, true)
      useEditor.setState({ recovery: null })
      pendingRecovery = null
    } catch (error) {
      useFileSecurityState.setState({ lockedRecovery: true })
      showError(error)
    } finally {
      useEditor.setState({ busy: false })
    }
  })()
}
export async function retryRecovery(): Promise<void> {
  if (useEditor.getState().busy) return
  useEditor.setState({ busy: true })
  try {
    useEditor.setState({ recovery: await readRecoveryContents() })
  } catch (error) {
    showError(error)
  } finally {
    useEditor.setState({ busy: false })
  }
}
export async function restoreBackup(id: string): Promise<void> {
  const bridge = window.trelyx
  if (!bridge || useEditor.getState().busy) return
  useEditor.getState().commitDraft()
  if (!window.confirm('恢复此版本会替换当前导图内容；文件会在你下次保存时更新。继续？')) return
  const before = useEditor.getState()
  useEditor.setState({ busy: true })
  let opened: OpenedDocument | null = null
  try {
    opened = await unlockOpenedDocument(await bridge.restoreDocumentBackup(id))
    if (!opened) return
    const workbook = deserializeWorkbook(opened.contents)
    const current = useEditor.getState()
    if (
      (current.workbook !== before.workbook ||
        current.editingId !== before.editingId ||
        current.editingSurface !== before.editingSurface ||
        current.draft !== before.draft ||
        current.richDraft !== before.richDraft) &&
      !window.confirm('读取版本期间当前导图已有更改。仍要恢复？')
    )
      return
    await activateOpenedDocument(opened)
    current.replace(workbook, current.path, true)
  } catch (error) {
    showError(error)
  } finally {
    if (opened) await cancelOpenedDocument(opened)
    useEditor.setState({ busy: false })
  }
}
