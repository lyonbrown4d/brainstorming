import { subscribeWindowTransfers } from '@renderer/state/windowTransfers'
import { runWindowMenuAction } from '@renderer/state/windowMenuActions'
import { flushNativeEditor } from '@renderer/state/nativeEditorQueue'
import { translate } from '@renderer/i18n'
import { useEffect } from 'react'
import { $getRoot, getNearestEditorFromDOMNode, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { $convertToMarkdownString } from '@lexical/markdown'
import { richTransformers } from '@renderer/components/metadata/richTransformers'
import { useEditor } from '@renderer/state/editor'
import { newDocument, openDocument, saveDocument } from '@renderer/state/files'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { requestViewport } from '@renderer/state/viewport'
import { usePresentation } from '@renderer/state/presentation'
import { createRecoveryWriter } from '@renderer/lib/recoveryWriter'
import { queueDocumentWrite } from '@renderer/lib/documentWriteQueue'
import { startDocumentAutosave } from '@renderer/state/documentAutosave'
import {
  anyDocumentDirty,
  closeActiveDocument,
  isSwitchingDocument,
  synchronizeDocumentTab,
  useDocumentTabs,
} from '@renderer/state/documentTabs'
import { workspaceRecoveryContents } from '@renderer/state/documentRecovery'
import { useWorkspace } from '@renderer/state/workspace'

export const useFileLifecycle = (): void => {
  useEffect(() => {
    let alive = true
    let ready = false
    let recoveryRead = false
    let pendingOpen = true
    let nativeStatus = ''
    let emptyWorkspaceQueued = false
    let hadWorkspace = useDocumentTabs.getState().tabs.length > 0
    let retainedPaths = new Set(
      useDocumentTabs
        .getState()
        .tabs.map((tab) => tab.editor.path)
        .filter((path): path is string => path !== null),
    )
    const bridge = requireDesktopAPI()
    const stopAutosave = startDocumentAutosave()
    const stopTransfers = subscribeWindowTransfers()
    const reportError = (error: unknown): void => {
      if (alive)
        useEditor
          .getState()
          .setError(
            error instanceof Error ? error.message : translate('fileOperationFailedPleaseRetry'),
          )
    }
    const runFileAction = (operation: () => Promise<void>): void => {
      void operation().catch(reportError)
    }
    const openPending = (): void => {
      if (
        !alive ||
        isSwitchingDocument() ||
        !recoveryRead ||
        !pendingOpen ||
        useEditor.getState().busy
      )
        return
      pendingOpen = false
      runFileAction(() => openDocument(undefined, true))
    }
    const removeOpenFile = bridge.onOpenFile(() => {
      pendingOpen = true
      openPending()
    })
    const canWriteRecovery = (): boolean =>
      alive &&
      ready &&
      !isSwitchingDocument() &&
      !useEditor.getState().busy &&
      useDocumentTabs.getState().recovery.length === 0 &&
      hadWorkspace
    const writeRecovery = async (): Promise<void> => {
      if (!canWriteRecovery()) return
      await flushNativeEditor()
      if (!canWriteRecovery()) return
      await bridge.writeWorkspaceRecovery(workspaceRecoveryContents())
    }
    const reportRecoveryError = (error: unknown): void => {
      if (alive)
        useEditor.getState().setError(
          translate('couldNotWriteRecoveryDataValue0', {
            value0: error instanceof Error ? error.message : translate('pleaseSaveTheFileManually'),
          }),
        )
    }
    const recoveryWriter = createRecoveryWriter(writeRecovery, reportRecoveryError)
    const synchronize = (): void => {
      if (!alive || isSwitchingDocument()) return
      const state = useEditor.getState()
      const workspace = useWorkspace.getState()
      const tabs = useDocumentTabs.getState()
      const paths = new Set(
        tabs.tabs.map((tab) => tab.editor.path).filter((path): path is string => path !== null),
      )
      for (const path of retainedPaths)
        if (!paths.has(path))
          void queueDocumentWrite(path, async () => {
            if (!useDocumentTabs.getState().tabs.some((tab) => tab.editor.path === path))
              await bridge.releaseDocument(path)
          }).catch(reportError)
      retainedPaths = paths
      hadWorkspace ||= tabs.tabs.length > 0
      const dirty = anyDocumentDirty()
      void bridge.windows
        ?.syncMenuState({
          hasDocument: workspace.hasDocument,
          busy: state.busy,
          playing: usePresentation.getState().playing,
        })
        .catch(reportError)
      const protectedRecovery = !ready || tabs.recovery.length > 0
      const documentTitle = workspace.hasDocument ? state.workbook.title : ''
      const status = `${dirty}:${protectedRecovery}:${documentTitle}`
      if (status !== nativeStatus) {
        try {
          bridge.setDirty(dirty, protectedRecovery, documentTitle)
          nativeStatus = status
        } catch (error) {
          recoveryWriter.cancel()
          reportError(error)
          return
        }
      }
      window.document.title =
        workspace.screen === 'editor'
          ? `${dirty ? '• ' : ''}${state.workbook.title} — Brainstorming`
          : 'Brainstorming'
      if (tabs.tabs.length > 0 || tabs.recovery.length > 0) emptyWorkspaceQueued = false
      if (!canWriteRecovery()) recoveryWriter.cancel()
      else if (tabs.tabs.length > 0) recoveryWriter.schedule()
      else {
        recoveryWriter.cancel()
        if (emptyWorkspaceQueued) return
        // Closing the last tab must not leave its recovery behind if the app quits immediately.
        emptyWorkspaceQueued = true
        void writeRecovery().catch((error: unknown) => {
          emptyWorkspaceQueued = false
          reportRecoveryError(error)
        })
      }
    }
    const read = Promise.resolve().then(() => bridge.readWorkspaceRecovery())
    void read
      .then((recovery) => {
        if (!alive) return
        ready = true
        recoveryRead = true
        hadWorkspace ||= recovery.length > 0
        useDocumentTabs.setState({ recovery })
        synchronize()
        openPending()
      })
      .catch((error: unknown) => {
        if (!alive) return
        // Explicit OS opens may create new tabs while damaged recovery stays protected.
        ready = false
        recoveryRead = true
        reportError(
          error instanceof Error ? error : new Error(translate('couldNotLoadRecoveryDataSaveThe')),
        )
        synchronize()
        openPending()
      })
    const unsubscribe = useEditor.subscribe((state, previous) => {
      if (isSwitchingDocument()) return
      if (
        state.busy !== previous.busy ||
        state.workbook !== previous.workbook ||
        state.draft !== previous.draft ||
        state.richDraft !== previous.richDraft ||
        state.editingId !== previous.editingId ||
        state.editingSurface !== previous.editingSurface ||
        state.activeSheetId !== previous.activeSheetId ||
        state.baseline !== previous.baseline ||
        state.path !== previous.path
      ) {
        synchronizeDocumentTab()
        synchronize()
      }
      if (state.busy !== previous.busy) openPending()
    })
    const unsubscribeTabs = useDocumentTabs.subscribe(() => {
      if (isSwitchingDocument()) return
      // Capturing the editor here would recursively update this store.
      synchronize()
      openPending()
    })
    const unsubscribeWorkspace = useWorkspace.subscribe(synchronize)
    const unsubscribePresentation = usePresentation.subscribe((state, previous) => {
      if (state.playing !== previous.playing) synchronize()
    })
    const removeMenu = bridge.onMenuAction((action, windowId) => {
      if (runWindowMenuAction(action, windowId)) return
      if (usePresentation.getState().playing) return
      if (
        useWorkspace.getState().screen !== 'editor' &&
        !['new', 'open', 'closeTab'].includes(action)
      )
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
          runFileAction(() => openDocument())
          break
        case 'save':
          runFileAction(() => saveDocument())
          break
        case 'saveAs':
          runFileAction(() => saveDocument(true))
          break
        case 'closeTab':
          closeActiveDocument()
          break
        case 'undo':
          state.undo()
          break
        case 'redo':
          state.redo()
          break
      }
    })
    synchronizeDocumentTab()
    synchronize()
    return () => {
      alive = false
      recoveryWriter.dispose()
      stopAutosave()
      stopTransfers()
      unsubscribe()
      unsubscribeWorkspace()
      unsubscribePresentation()
      unsubscribeTabs()
      removeMenu()
      removeOpenFile()
    }
  }, [])
}
