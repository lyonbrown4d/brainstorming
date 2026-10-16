import { useEffect } from 'react'
import { $getRoot, getNearestEditorFromDOMNode, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { applyCommand, serializeWorkbook } from '@core'
import { $convertToMarkdownString } from '@lexical/markdown'
import { richTransformers } from '../components/metadata/richTransformers'
import { draftCommand } from '../state/editorDraft'
import { isDirty, useEditor } from '../state/editor'
import { newDocument, openDocument, saveDocument, readRecoveryContents } from '../state/files'
import { writeBrowserRecovery } from '../state/recovery'

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
      if (!ready || state.recovery || state.busy) return
      timer = setTimeout(() => {
        const current = useEditor.getState()
        let document = current.history.document
        try {
          const command = draftCommand(current)
          if (command) document = applyCommand(document, command)
        } catch {
          return
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
    const read = readRecoveryContents()
    void read
      .then((recovery) => {
        if (!alive) return
        useEditor.setState({ recovery })
        ready = true
        recoveryRead = true
        synchronize()
        openPending()
      })
      .catch((error: unknown) => {
        if (!alive) return
        // Permit explicit OS opens while keeping a damaged recovery protected from writes.
        recoveryRead = true
        useEditor
          .getState()
          .setError(
            error instanceof Error ? error.message : '无法读取自动恢复记录。请先手动保存当前导图。',
          )
        openPending()
      })
    const unsubscribe = useEditor.subscribe((state, previous) => {
      if (previous.recovery !== null && state.recovery === null) ready = true
      if (
        state.busy !== previous.busy ||
        state.workbook !== previous.workbook ||
        state.draft !== previous.draft ||
        state.richDraft !== previous.richDraft ||
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
        const content = editor.read('latest', () => ({
          text: $getRoot().getTextContent(),
          markdown: $convertToMarkdownString(richTransformers, undefined, true),
        }))
        if (state.editingSurface === 'rich-title')
          state.setRichDraft(content.markdown, content.text)
        else
          state.setDraft(
            state.editingSurface === 'notes' &&
              state.history.document.topics[state.editingId]?.metadata?.notesFormat === 'markdown'
              ? content.markdown
              : content.text,
          )
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
