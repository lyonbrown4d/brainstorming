import { timer, type Subscription } from 'rxjs'
import { queueDocumentPreviews, cancelDocumentPreviews } from '@renderer/lib/documentPreviews'
import { translate } from '@renderer/i18n'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { createRecoveryWriter } from '@renderer/lib/recoveryWriter'
import { queueDocumentWrite } from '@renderer/lib/documentWriteQueue'
import { useEditor } from '@renderer/state/editor'
import { isSwitchingDocument, useDocumentTabs } from '@renderer/state/documentTabs'
import { serializedDocumentSnapshot } from '@renderer/state/documentSnapshot'
import {
  savedDocumentEditor,
  updateDocumentSaveState,
  type DocumentSaveTarget,
} from '@renderer/state/documentSaveState'
import { suggestedFileName } from '@renderer/state/fileName'

interface AutosaveEntry {
  readonly target: DocumentSaveTarget
  readonly writer: ReturnType<typeof createRecoveryWriter>
  contents: string | null
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
      contents: null,
      retry: undefined,
      error: null,
      writer: createRecoveryWriter(
        () =>
          queueDocumentWrite(target.path, async () => {
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
      try {
        const contents = serializedDocumentSnapshot(state)
        if (contents === state.baseline || useEditor.getState().busy) {
          entry.writer.cancel()
          entry.retry?.unsubscribe()
          entry.contents = null
        } else if (entry.contents !== contents) {
          entry.contents = contents
          entry.retry?.unsubscribe()
          entry.writer.schedule()
        }
      } catch (error) {
        // Invalid drafts remain editable; manual save/commit presents their validation error.
        entry.writer.cancel()
        entry.contents = null
        if (error instanceof Error && entry.error !== error.message) {
          entry.error = error.message
          updateDocumentSaveState(entry.target, { error: error.message })
        }
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
