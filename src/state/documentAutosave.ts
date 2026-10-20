import { timer, type Subscription } from 'rxjs'
import { queueDocumentPreviews, cancelDocumentPreviews } from '@renderer/lib/documentPreviews'
import { translate } from '@renderer/i18n'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { createRecoveryWriter } from '@renderer/lib/recoveryWriter'
import { queueDocumentWrite } from '@renderer/lib/documentWriteQueue'
import { useEditor } from '@renderer/state/editor'
import { isSwitchingDocument, useDocumentTabs } from '@renderer/state/documentTabs'
import {
  sameSnapshot,
  snapshotIdentity,
  serializedDocumentSnapshot,
  type SnapshotIdentity,
} from '@renderer/state/documentSnapshot'
import { flushNativeEditor, hasPendingNativeEditor } from '@renderer/state/nativeEditorQueue'
import {
  savedDocumentEditor,
  updateDocumentSaveState,
  type DocumentSaveTarget,
} from '@renderer/state/documentSaveState'
import { suggestedFileName } from '@renderer/state/fileName'

interface AutosaveEntry {
  readonly target: DocumentSaveTarget
  readonly writer: ReturnType<typeof createRecoveryWriter>
  candidate: SnapshotIdentity | null
  baseline: string | null
  retry: Subscription | undefined
  error: string | null
}

/** Named tabs save independently; pathless canvases never enter a persistence queue. */
export const startDocumentAutosave = (): (() => void) => {
  let alive = true
  const entries = new Map<string, AutosaveEntry>()
  const disposeEntry = (entry: AutosaveEntry): void => {
    cancelDocumentPreviews(entry.target.workbookId)
    entry.writer.dispose()
    entry.retry?.unsubscribe()
  }
  const eligible = (entry: AutosaveEntry): boolean =>
    alive &&
    entries.get(entry.target.tabId) === entry &&
    !isSwitchingDocument() &&
    !useEditor.getState().busy &&
    savedDocumentEditor(entry.target) !== undefined
  const createEntry = (target: DocumentSaveTarget): AutosaveEntry => {
    const entry: AutosaveEntry = {
      target,
      candidate: null,
      baseline: null,
      retry: undefined,
      error: null,
      writer: createRecoveryWriter(
        () =>
          queueDocumentWrite(target.path, async () => {
            if (!eligible(entry)) return
            await flushNativeEditor(target.workbookId)
            if (!eligible(entry)) return
            const state = savedDocumentEditor(target)
            if (!state) return
            const contents = serializedDocumentSnapshot(state)
            if (contents === state.baseline) return
            const path = await requireDesktopAPI().saveDocument({
              path: target.path,
              contents,
              suggestedName: suggestedFileName(state.workbook.title),
              openDocumentIds: useDocumentTabs.getState().tabs.map((tab) => tab.editor.workbook.id),
            })
            if (path !== target.path) throw new Error(translate('fileOperationFailedPleaseRetry'))
            if (!eligible(entry)) return
            const current = savedDocumentEditor(target)
            updateDocumentSaveState(target, {
              baseline: contents,
              ...(entry.error !== null && current?.error === entry.error ? { error: null } : {}),
            })
            queueDocumentPreviews(target, contents, state.activeSheetId)
            entry.error = null
          }),
        (error) => {
          if (!eligible(entry)) return
          entry.error =
            error instanceof Error ? error.message : translate('fileOperationFailedPleaseRetry')
          updateDocumentSaveState(target, { error: entry.error })
          entry.retry?.unsubscribe()
          entry.retry = timer(3000).subscribe(() => {
            if (eligible(entry)) entry.writer.schedule()
          })
        },
      ),
    }
    return entry
  }
  const synchronize = (): void => {
    if (!alive || isSwitchingDocument()) return
    const { tabs, activeId } = useDocumentTabs.getState()
    const named = tabs.filter((tab) => tab.editor.path !== null)
    for (const [id, entry] of entries)
      if (
        !named.some(
          (tab) =>
            tab.id === id &&
            tab.editor.path === entry.target.path &&
            tab.editor.workbook.id === entry.target.workbookId,
        )
      ) {
        disposeEntry(entry)
        entries.delete(id)
      }
    for (const tab of named) {
      const state = tab.id === activeId ? useEditor.getState() : tab.editor
      if (state.path === null) continue
      let entry = entries.get(tab.id)
      if (!entry) {
        entry = createEntry({ tabId: tab.id, workbookId: state.workbook.id, path: state.path })
        entries.set(tab.id, entry)
      }
      const candidate = snapshotIdentity(state)
      if (useEditor.getState().busy || hasPendingNativeEditor(state.workbook.id)) continue
      if (!sameSnapshot(entry.candidate, candidate) || entry.baseline !== state.baseline) {
        entry.baseline = state.baseline
        entry.candidate = candidate
        entry.retry?.unsubscribe()
        entry.writer.schedule()
      }
    }
  }
  const unsubscribeEditor = useEditor.subscribe(synchronize)
  const unsubscribeTabs = useDocumentTabs.subscribe(synchronize)
  synchronize()
  return () => {
    alive = false
    unsubscribeEditor()
    unsubscribeTabs()
    for (const entry of entries.values()) disposeEntry(entry)
    entries.clear()
  }
}
