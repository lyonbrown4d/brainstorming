import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useWorkspace } from '@renderer/state/workspace'
import { flushNativeEditor, hasPendingNativeEditor } from '@renderer/state/nativeEditorQueue'

type PlaybackMode = 'audience' | 'presenter'
interface PendingPlayback {
  cancel: () => void
  mode: PlaybackMode
}
let pending: PendingPlayback | undefined

export const cancelPendingPresentation = (): void => pending?.cancel()

export const setPendingPresentationMode = (mode: PlaybackMode): void => {
  if (pending) pending.mode = mode
}

/** Keep the existing page until native drafts and already queued edits are authoritative. */
export const deferPresentationUntilCommitted = (start: (mode: PlaybackMode) => void): boolean => {
  cancelPendingPresentation()
  const source = useEditor.getState()
  if (!hasPendingNativeEditor(source.workbook.id)) return false
  const presentation = usePresentation.getState()
  const screen = useWorkspace.getState().screen
  const hash = typeof window === 'undefined' ? undefined : window.location.hash
  const controller = new AbortController()
  const sameDocument = (): boolean => {
    const current = useEditor.getState()
    return (
      current.workbook.id === source.workbook.id &&
      current.activeSheetId === source.activeSheetId &&
      current.history.document.id === source.history.document.id
    )
  }
  const cleanup = (): void => {
    unsubscribeEditor()
    unsubscribeWorkspace()
    unsubscribePresentation()
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', cancelOnEscape)
      window.removeEventListener('hashchange', cancel)
      window.removeEventListener('popstate', cancel)
    }
    if (pending === request) pending = undefined
  }
  const cancel = (): void => {
    controller.abort()
    cleanup()
  }
  const cancelOnEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.isComposing) cancel()
  }
  const request: PendingPlayback = { cancel, mode: 'audience' }
  const unsubscribeEditor = useEditor.subscribe((next) => {
    if (!sameDocument() || next.editingId || next.busy) cancel()
  })
  const unsubscribeWorkspace = useWorkspace.subscribe((next) => {
    if (next.screen !== screen) cancel()
  })
  const unsubscribePresentation = usePresentation.subscribe((next) => {
    if (
      next.workspaceMode !== presentation.workspaceMode ||
      next.composerIndex !== presentation.composerIndex
    )
      cancel()
  })
  pending = request
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', cancelOnEscape)
    window.addEventListener('hashchange', cancel)
    window.addEventListener('popstate', cancel)
  }
  void flushNativeEditor(source.workbook.id)
    .then(() => {
      const accepted =
        !controller.signal.aborted &&
        sameDocument() &&
        !useEditor.getState().editingId &&
        !useEditor.getState().busy &&
        useWorkspace.getState().screen === screen &&
        (typeof window === 'undefined' || window.location.hash === hash)
      cleanup()
      if (accepted) start(request.mode)
    })
    .catch((error: unknown) => {
      cleanup()
      if (!controller.signal.aborted && sameDocument())
        useEditor.getState().setError(error instanceof Error ? error.message : String(error))
    })
  return true
}
