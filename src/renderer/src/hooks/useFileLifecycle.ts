import { useEffect } from 'react'
import { $getRoot, getNearestEditorFromDOMNode, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { applyCommand, serializeWorkbook } from '@core'
import { $convertToMarkdownString } from '@lexical/markdown'
import { richTransformers } from '../components/metadata/richTransformers'
import { draftCommand } from '../state/editorDraft'
import { isDirty, useEditor } from '../state/editor'
import { newDocument, openDocument, saveDocument, readRecoveryContents } from '../state/files'
import { writeBrowserRecovery } from '../state/recovery'
import { requestViewport } from '../state/viewport'
import { usePresentation } from '../state/presentation'
import { useSpatialView } from '../state/spatial'
import { createRecoveryWriter } from '../lib/recoveryWriter'
import { useWorkspace } from '../state/workspace'

export function useFileLifecycle(): void {
  useEffect(() => {
    let alive = true
    let ready = false
    let recoveryRead = false
    let pendingOpen = true
    let nativeStatus = ''
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
      const workspace = useWorkspace.getState()
      const dirty = workspace.hasDocument && isDirty()
      const protectedRecovery = !ready || Boolean(state.recovery)
      const status = `${dirty}:${protectedRecovery}`
      if (status !== nativeStatus) {
        bridge?.setDirty(dirty, protectedRecovery)
        nativeStatus = status
      }
      window.document.title =
        workspace.screen === 'editor'
          ? `${dirty ? '• ' : ''}${state.workbook.title} — Trelyx`
          : 'Trelyx'
      if (!ready || state.recovery || state.busy || !workspace.hasDocument) recoveryWriter.cancel()
      else recoveryWriter.schedule()
    }
    const recoveryWriter = createRecoveryWriter(
      async () => {
        const current = useEditor.getState()
        if (
          !alive ||
          !ready ||
          current.recovery ||
          current.busy ||
          !useWorkspace.getState().hasDocument
        )
          return
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
        await (bridge ? bridge.writeRecovery(contents) : writeBrowserRecovery(contents))
      },
      (error) => {
        if (alive)
          useEditor
            .getState()
            .setError(
              `自动恢复写入失败：${error instanceof Error ? error.message : '请手动保存文件。'}`,
            )
      },
    )
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
    const unsubscribeWorkspace = useWorkspace.subscribe(synchronize)
    const removeMenu = bridge?.onMenuAction((action) => {
      if (usePresentation.getState().playing) return
      if (useWorkspace.getState().screen !== 'editor' && action !== 'new' && action !== 'open')
        return
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
      if (['zoomIn', 'zoomOut', 'actualSize', 'centerRoot'].includes(action)) {
        if (action === 'centerRoot') {
          state.select(state.history.document.rootId)
          useSpatialView.getState().setFocus(state.activeSheetId, null)
        }
        if (
          action === 'zoomIn' ||
          action === 'zoomOut' ||
          action === 'actualSize' ||
          action === 'centerRoot'
        )
          requestViewport(action)
        return
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
      recoveryWriter.dispose()
      unsubscribe()
      unsubscribeWorkspace()
      removeMenu?.()
      removeOpenFile?.()
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [])
}
