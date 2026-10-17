import { deserializeWorkbook } from '@core'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import {
  useDocumentTabs,
  synchronizeDocumentTab,
  openDocumentTab,
  findDocumentTab,
  switchDocumentTab,
} from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { serializedDocumentSnapshot } from '@renderer/state/documentSnapshot'
import {
  activateOpenedDocument,
  unlockOpenedDocument,
  cancelOpenedDocument,
} from '@renderer/state/lockedFiles'
import { translate } from '@renderer/i18n'
import type { OpenedDocument } from '@shared/contracts'
import { stopPresentation } from '@renderer/state/presentation'

export const workspaceRecoveryContents = (): readonly string[] => {
  const { tabs, activeId } = useDocumentTabs.getState()
  return tabs.flatMap((tab) => {
    const state = tab.id === activeId ? useEditor.getState() : tab.editor
    return state.path === null ? [] : [serializedDocumentSnapshot(state)]
  })
}

export const restoreWorkspaceRecovery = async (): Promise<void> => {
  if (useEditor.getState().busy) return
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  stopPresentation()
  synchronizeDocumentTab()
  useEditor.setState({ busy: true })
  const processed = new Set<string>()
  let records: readonly OpenedDocument[] = []
  try {
    await Promise.all(useDocumentTabs.getState().recovery.map(cancelOpenedDocument))
    records = await requireDesktopAPI().readWorkspaceRecovery()
    useDocumentTabs.setState({ recovery: records })
    for (const opened of records) {
      const id =
        opened.recoveryId ?? (opened.contents ? deserializeWorkbook(opened.contents).id : '')
      if (id && findDocumentTab(null, id)) {
        await cancelOpenedDocument(opened)
        processed.add(id)
        useDocumentTabs.setState({
          recovery: records.filter(
            (entry) =>
              !processed.has(
                entry.recoveryId ?? (entry.contents ? deserializeWorkbook(entry.contents).id : ''),
              ),
          ),
        })
        continue
      }
      if (useDocumentTabs.getState().tabs.length >= 32) throw new Error(translate('maxOpenMaps'))
      const result = await unlockOpenedDocument(opened, translate('unlockRecoveryDataLabel700'))
      if (!result) return
      const workbook = deserializeWorkbook(result.contents)
      const existing = findDocumentTab(null, workbook.id)
      if (existing) {
        await cancelOpenedDocument(result)
      } else {
        await activateOpenedDocument(result)
        synchronizeDocumentTab(true)
        if (!openDocumentTab(workbook, null, true, true)) return
      }
      processed.add(opened.recoveryId ?? workbook.id)
      useDocumentTabs.setState({
        recovery: records.filter(
          (entry) =>
            !processed.has(
              entry.recoveryId ?? (entry.contents ? deserializeWorkbook(entry.contents).id : ''),
            ),
        ),
      })
    }
  } catch (error) {
    useEditor
      .getState()
      .setError(
        error instanceof Error ? error.message : translate('fileOperationFailedPleaseRetry'),
      )
  } finally {
    await Promise.allSettled(records.map(cancelOpenedDocument))
    useEditor.setState({ busy: false })
    synchronizeDocumentTab()
    const existing = useDocumentTabs.getState().tabs.at(-1)
    if (existing) switchDocumentTab(existing.id)
  }
}

/** Explicit dismissal authorizes replacement of prior recovery only on the next native write. */
export const dismissWorkspaceRecovery = async (): Promise<void> => {
  if (useEditor.getState().busy) return
  const records = useDocumentTabs.getState().recovery
  useDocumentTabs.setState({ recovery: [] })
  await Promise.allSettled(records.map(cancelOpenedDocument))
}
