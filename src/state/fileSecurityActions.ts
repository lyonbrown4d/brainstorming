import { translate } from '@renderer/i18n'
import { deserializeWorkbook } from '@core'
import type { OpenedDocument } from '@shared/contracts'
import { isDirty, useEditor } from '@renderer/state/editor'
import {
  activateOpenedDocument,
  cancelOpenedDocument,
  unlockOpenedDocument,
} from '@renderer/state/lockedFiles'
import { useFileSecurityState } from '@renderer/state/password'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { queueDocumentWrite } from '@renderer/lib/documentWriteQueue'

let pendingRecovery: OpenedDocument | null = null
const showError = (error: unknown): void => {
  useEditor
    .getState()
    .setError(error instanceof Error ? error.message : translate('fileOperationFailed'))
}
export const readRecoveryContents = async (): Promise<string | null> => {
  const opened = await requireDesktopAPI().readLockedRecovery()
  if (!opened) return null
  const result = await unlockOpenedDocument(opened, translate('unlockRecoveryDataLabel700'))
  if (!result) {
    useFileSecurityState.setState({ lockedRecovery: true })
    throw new Error(translate('encryptedRecoveryDataIsPreservedYouCan'))
  }
  pendingRecovery = result
  useFileSecurityState.setState({ lockedRecovery: false })
  return result.contents
}
export const changeFilePassword = async (password: string | null): Promise<void> => {
  const state = useEditor.getState()
  if (state.busy) return
  state.commitDraft()
  if (useEditor.getState().editingId)
    throw new Error(translate('finishEditingTheCurrentTopicFirst'))
  const { workbook, path } = useEditor.getState()
  const documentId = workbook.id
  useEditor.setState({ busy: true })
  try {
    const security = await queueDocumentWrite(path, () =>
      requireDesktopAPI().setFilePassword(documentId, password),
    )
    const current = useEditor.getState()
    if (current.workbook.id !== documentId || current.path !== path) return
    useFileSecurityState.setState({ documentId, encrypted: security.encrypted })
    useEditor.setState({ baseline: '', error: null })
  } finally {
    useEditor.setState({ busy: false })
  }
}
export const restoreRecovery = (): void => {
  const contents = useEditor.getState().recovery
  if (!contents || useEditor.getState().busy) return
  useEditor.getState().commitDraft()
  if (isDirty() && !window.confirm(translate('thisMapHasUnsavedChangesDiscardThemLabel703'))) return
  useEditor.setState({ busy: true })
  void (async () => {
    try {
      const workbook = deserializeWorkbook(contents)
      if (pendingRecovery?.contents !== contents)
        throw new Error(translate('recoverySessionExpiredReloadRecoveryData'))
      await activateOpenedDocument(pendingRecovery)
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
export const retryRecovery = async (): Promise<void> => {
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
export const restoreBackup = async (id: string): Promise<void> => {
  if (useEditor.getState().busy) return
  useEditor.getState().commitDraft()
  if (!window.confirm(translate('restoringThisVersionReplacesTheCurrentMap'))) return
  const before = useEditor.getState()
  useEditor.setState({ busy: true })
  let opened: OpenedDocument | null = null
  try {
    opened = await queueDocumentWrite(before.path, async () =>
      unlockOpenedDocument(await requireDesktopAPI().restoreDocumentBackup(id)),
    )
    if (!opened) return
    const workbook = deserializeWorkbook(opened.contents)
    const current = useEditor.getState()
    if (current.workbook.id !== before.workbook.id || current.path !== before.path) return
    if (
      (current.workbook !== before.workbook ||
        current.editingId !== before.editingId ||
        current.editingSurface !== before.editingSurface ||
        current.draft !== before.draft ||
        current.richDraft !== before.richDraft) &&
      !window.confirm(translate('theMapChangedWhileLoadingTheVersion'))
    )
      return
    await activateOpenedDocument(opened)
    const accepted = useEditor.getState()
    if (accepted.workbook.id !== before.workbook.id || accepted.path !== before.path) return
    accepted.replace(workbook, before.path, true)
  } catch (error) {
    showError(error)
  } finally {
    if (opened) await cancelOpenedDocument(opened)
    useEditor.setState({ busy: false })
  }
}
