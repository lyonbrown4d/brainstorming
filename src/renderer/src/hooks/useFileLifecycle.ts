import { useEffect } from 'react'
import { $getRoot, getNearestEditorFromDOMNode, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { applyCommand, serializeWorkbook } from '@core'
import { isDirty, useEditor } from '../state/editor'
import { newDocument, openDocument, saveDocument } from '../state/files'
import { readBrowserRecovery, writeBrowserRecovery } from '../state/recovery'

export function useFileLifecycle(): void {
  useEffect(() => {
    let alive = true
    let ready = false
    let recoveryRead = false
    let pendingOpen = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const bridge = window.trelyx
    function openPending(): void {
      const state = useEditor.getState()
      if (!bridge || !recoveryRead || !pendingOpen || state.busy || state.recovery) return
      pendingOpen = false
      void openDocument(undefined, true)
    }
    const removeOpenFile = bridge?.onOpenFile(() => {
      pendingOpen = true
      openPending()
    })
    function synchronize(): void {
      const state = useEditor.getState()
      bridge?.setDirty(isDirty(), !ready || Boolean(state.recovery))
      window.document.title = `${isDirty() ? '• ' : ''}${state.workbook.title} — Trelyx`
      clearTimeout(timer)
      if (!ready || state.recovery) return
      timer = setTimeout(() => {
        const current = useEditor.getState()
        let document = current.history.document
        if (current.editingId && (current.editingSurface === 'notes' || current.draft.trim())) {
          try {
            document = applyCommand(
              document,
              current.editingSurface === 'notes'
                ? { type: 'setTopicNotes', topicId: current.editingId, notes: current.draft }
                : { type: 'renameTopic', topicId: current.editingId, title: current.draft.trim() },
            )
          } catch {
            return
          }
        }
        const contents = serializeWorkbook({
          ...current.workbook,
          sheets: current.workbook.sheets.map((sheet) =>
            sheet.id === current.activeSheetId ? { ...sheet, document } : sheet,
          ),
        })
        const write = bridge ? bridge.writeRecovery(contents) : writeBrowserRecovery(contents)
        void write.catch((error: unknown) => {
          useEditor
            .getState()
            .setError(
              `自动恢复写入失败：${error instanceof Error ? error.message : '请手动保存文件。'}`,
            )
        })
      }, 700)
    }
    const read = bridge ? bridge.readRecovery() : readBrowserRecovery()
    void read
      .then((recovery) => {
        if (!alive) return
        useEditor.setState({ recovery })
        ready = true
        recoveryRead = true
        synchronize()
        openPending()
      })
      .catch(() => {
        if (!alive) return
        // Permit explicit OS opens while keeping a damaged recovery protected from writes.
        recoveryRead = true
        useEditor.getState().setError('无法读取自动恢复记录。请先手动保存当前导图。')
        openPending()
      })
    const unsubscribe = useEditor.subscribe((state, previous) => {
      if (
        state.workbook !== previous.workbook ||
        state.draft !== previous.draft ||
        state.editingId !== previous.editingId ||
        state.baseline !== previous.baseline ||
        state.recovery !== previous.recovery
      )
        synchronize()
      if (state.busy !== previous.busy || state.recovery !== previous.recovery) openPending()
    })
    const removeMenu = bridge?.onMenuAction((action) => {
      const state = useEditor.getState()
      const target = window.document.activeElement
      const editor =
        target instanceof HTMLElement && target.isContentEditable
          ? getNearestEditorFromDOMNode(target)
          : null
      if (editor?.isComposing()) return
      if (editor && state.editingId) {
        if (action === 'undo' || action === 'redo') {
          editor.dispatchCommand(action === 'undo' ? UNDO_COMMAND : REDO_COMMAND, undefined)
          return
        }
        state.setDraft(editor.read('latest', () => $getRoot().getTextContent()))
      }
      switch (action) {
        case 'new':
          newDocument()
          break
        case 'open':
          void openDocument()
          break
        case 'save':
          void saveDocument()
          break
        case 'saveAs':
          void saveDocument(true)
          break
        case 'undo':
          state.undo()
          break
        case 'redo':
          state.redo()
          break
      }
    })
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!bridge && isDirty()) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    synchronize()
    return () => {
      alive = false
      clearTimeout(timer)
      unsubscribe()
      removeMenu?.()
      removeOpenFile?.()
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [])
}
