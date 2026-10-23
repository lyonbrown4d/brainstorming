import type { MenuAction } from '@shared/contracts'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { moveDocumentToWindow } from '@renderer/state/windowTransfers'
import { requestSettings } from '@renderer/state/settingsMenu'
import { toggleInspector } from '@renderer/state/inspectorNavigation'
import { useCanvasPreferences } from '@renderer/state/canvasPreferences'
import { saveSpatialView } from '@renderer/state/spatialActions'
import {
  openPresentationComposer,
  showPresentationStep,
  stopPresentation,
} from '@renderer/state/presentation'
import { runNativeExportMenuAction } from '@renderer/state/exportDialog'

const run = (operation: Promise<unknown> | undefined): void => {
  void operation?.catch((error: unknown) => {
    useEditor.getState().setError(error instanceof Error ? error.message : String(error))
  })
}
export const runWindowMenuAction = (action: MenuAction, targetWindowId?: string): boolean => {
  const api = requireDesktopAPI()
  if (action === 'moveTabWindow') {
    const id = useDocumentTabs.getState().activeId
    if (id && targetWindowId) run(moveDocumentToWindow(id, targetWindowId))
    return true
  }
  switch (action) {
    case 'settings':
      requestSettings()
      return true
    case 'shortcuts':
      requestSettings('shortcuts')
      return true
    case 'newWindow':
      run(api.windows?.newWindow())
      return true
    case 'openNewWindow':
      run(api.windows?.openDocumentInNewWindow())
      return true
    case 'fullScreen':
      run(api.toggleFullScreen?.())
      return true
    case 'stopPresentation':
      stopPresentation()
      return true
  }
  if (
    ![
      'moveTabNewWindow',
      'toggleOutline',
      'toggleProperties',
      'toggleMinimap',
      'view2d',
      'view3d',
      'presentation',
      'playPresentation',
      'export',
      'print',
    ].includes(action)
  )
    return false
  if (!useWorkspace.getState().hasDocument || useEditor.getState().busy) return true
  const editor = useEditor.getState()
  switch (action) {
    case 'moveTabNewWindow': {
      const id = useDocumentTabs.getState().activeId
      if (id) run(moveDocumentToWindow(id))
      break
    }
    case 'toggleOutline':
      useEditor.setState({ outlineOpen: !editor.outlineOpen })
      break
    case 'toggleProperties':
      toggleInspector()
      break
    case 'toggleMinimap': {
      const preferences = useCanvasPreferences.getState()
      preferences.setMinimap(!preferences.minimap)
      break
    }
    case 'view2d':
      saveSpatialView({ mode: '2d' })
      break
    case 'view3d':
      saveSpatialView({ mode: '3d' })
      break
    case 'presentation':
      openPresentationComposer()
      break
    case 'playPresentation':
      showPresentationStep(0)
      break
    case 'export':
    case 'print':
      run(runNativeExportMenuAction(action))
      break
  }
  return true
}
