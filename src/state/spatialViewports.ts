import { LRUCache } from 'lru-cache'
import type { Viewport } from '@xyflow/react'
import { useEditor } from '@renderer/state/editor'
import type { SpatialView } from '@renderer/state/spatialView'

const viewports = new LRUCache<string, Viewport>({ max: 512 })
const keyFor = (workbookId: string, sheetId: string, mode: SpatialView['mode']): string =>
  JSON.stringify([workbookId, sheetId, mode])

/** Mode-specific camera positions survive canvas remounts and never enter the document. */
export const getSpatialViewport = (
  workbookId: string,
  sheetId: string,
  mode: SpatialView['mode'],
): Viewport | undefined => {
  const editor = useEditor.getState()
  if (mode === '2d' && editor.workbook.id === workbookId)
    return editor.views[sheetId] ?? viewports.get(keyFor(workbookId, sheetId, mode))
  return viewports.get(keyFor(workbookId, sheetId, mode))
}

/** Keep the established editor viewport slot authoritative for 2D sessions. */
export const setSpatialViewport = (
  workbookId: string,
  sheetId: string,
  mode: SpatialView['mode'],
  viewport: Viewport,
): void => {
  viewports.set(keyFor(workbookId, sheetId, mode), { ...viewport })
  if (mode !== '2d') return
  useEditor.setState((state) =>
    state.workbook.id === workbookId && state.activeSheetId === sheetId
      ? { views: { ...state.views, [sheetId]: viewport } }
      : state,
  )
}
