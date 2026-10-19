import { useEffect } from 'react'
import { useEditor } from '@renderer/state/editor'
import { closePresentationWorkspace } from '@renderer/state/presentation'
import { usePresentationPlayback } from '@renderer/hooks/usePresentationPlayback'
import { useWorkspace } from '@renderer/state/workspace'
import { PresentationComposer } from '@renderer/components/presentation/PresentationComposer'
import { PresentationAudience } from '@renderer/components/presentation/PresentationAudience'
import { PresentationPresenter } from '@renderer/components/presentation/PresentationPresenter'

/** Lazy-load this entry at the app shell; inactive pages and slide previews stay unmounted. */
export const PresentationWorkspace = () => {
  const { presentation, fullscreen, fullscreenAvailable, toggleFullscreen } =
    usePresentationPlayback()
  const sheetId = useEditor((state) => state.activeSheetId)
  const workbookId = useEditor((state) => state.workbook.id)
  const screen = useWorkspace((state) => state.screen)
  useEffect(() => {
    if (
      presentation.sheetId !== sheetId ||
      presentation.workbookId !== workbookId ||
      screen !== 'editor'
    )
      closePresentationWorkspace()
  }, [presentation.sheetId, presentation.workbookId, sheetId, workbookId, screen])
  if (presentation.workspaceMode === 'composer') return <PresentationComposer />
  const props = { fullscreen, fullscreenAvailable, toggleFullscreen }
  if (presentation.workspaceMode === 'presenter') return <PresentationPresenter {...props} />
  if (presentation.workspaceMode === 'audience') return <PresentationAudience {...props} />
  return null
}

export default PresentationWorkspace
