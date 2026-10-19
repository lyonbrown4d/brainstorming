import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useWorkspace } from '@renderer/state/workspace'
import { applyWorkspacePath } from '@renderer/routing/workspaceNavigation'
import { canonicalWorkspacePath } from '@renderer/routing/workspacePaths'

export type WorkspaceNavigate = (pathname: string, options: { replace: boolean }) => void

/** One bridge, one microtask per user command; applying a route never pushes back. */
export const createWorkspaceRouteBridge = (navigate: WorkspaceNavigate) => {
  let pathname = ''
  let applying = false
  let queued = false
  let active = true
  const schedule = (): void => {
    if (applying || queued || !active || pathname === '/settings') return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!active || applying || pathname === '/settings') return
      const next = canonicalWorkspacePath()
      if (next !== pathname) {
        pathname = next
        navigate(next, { replace: false })
      }
    })
  }
  const subscriptions = [
    useDocumentTabs.subscribe((next, previous) => {
      if (next.activeId !== previous.activeId || next.tabs.length !== previous.tabs.length)
        schedule()
    }),
    useEditor.subscribe((next, previous) => {
      if (
        next.inspectorOpen !== previous.inspectorOpen ||
        next.inspectorMode !== previous.inspectorMode ||
        next.canvasSection !== previous.canvasSection ||
        next.activeSheetId !== previous.activeSheetId ||
        next.workbook.id !== previous.workbook.id
      )
        schedule()
    }),
    usePresentation.subscribe((next, previous) => {
      if (
        next.workspaceMode !== previous.workspaceMode ||
        next.sheetId !== previous.sheetId ||
        next.workbookId !== previous.workbookId
      )
        schedule()
    }),
    useWorkspace.subscribe((next, previous) => {
      if (
        next.screen !== previous.screen ||
        next.hasDocument !== previous.hasDocument ||
        next.creationStep !== previous.creationStep
      )
        schedule()
    }),
  ]
  return {
    applyLocation: (next: string): void => {
      pathname = next
      applying = true
      let accepted: string
      try {
        accepted = applyWorkspacePath(next)
      } finally {
        applying = false
      }
      if (accepted !== next) {
        pathname = accepted
        navigate(accepted, { replace: true })
      }
    },
    dispose: (): void => {
      active = false
      for (const unsubscribe of subscriptions) unsubscribe()
    },
  }
}
