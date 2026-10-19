import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'

/** Invalidate a pending read even when navigation leaves and later returns to the same route. */
export const watchCreationTarget = () => {
  const workspace = useWorkspace.getState()
  const editor = useEditor.getState()
  const tabId = useDocumentTabs.getState().activeId
  let stale = false
  const stopWorkspace = useWorkspace.subscribe((next) => {
    if (
      next.screen !== workspace.screen ||
      next.creationStep !== workspace.creationStep ||
      next.creationWorkbookId !== workspace.creationWorkbookId
    )
      stale = true
  })
  const stopEditor = useEditor.subscribe((next) => {
    if (next.workbook.id !== editor.workbook.id || next.activeSheetId !== editor.activeSheetId)
      stale = true
  })
  const stopTabs = useDocumentTabs.subscribe((next) => {
    if (next.activeId !== tabId) stale = true
  })
  return {
    valid: () => !stale,
    dispose: () => {
      stopWorkspace()
      stopEditor()
      stopTabs()
    },
  }
}
