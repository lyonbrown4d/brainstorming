import { create } from 'zustand'
import { getParentId, type MindMapDocument } from '@core'
import type { SpatialCameraState } from '@renderer/components/spatial/SpatialCanvas'

export type ViewMode = '2d' | '3d'
export interface SpatialSheetView {
  mode: ViewMode
  focusId: string | null
  camera?: SpatialCameraState
}
interface SpatialViewState {
  sheets: Readonly<Record<string, SpatialSheetView>>
  setMode: (sheetId: string, mode: ViewMode) => void
  setFocus: (sheetId: string, focusId: string | null) => void
  setCamera: (sheetId: string, camera: SpatialCameraState) => void
  reset: () => void
}

export const defaultSpatialView: SpatialSheetView = { mode: '2d', focusId: null }

// View preferences are deliberately separate from workbook content and undo history.
export const useSpatialView = create<SpatialViewState>((set) => ({
  sheets: {},
  setMode: (sheetId, mode) => {
    set((state) => ({
      sheets: {
        ...state.sheets,
        [sheetId]: { ...(state.sheets[sheetId] ?? defaultSpatialView), mode },
      },
    }))
  },
  setFocus: (sheetId, focusId) => {
    set((state) => {
      const previous = state.sheets[sheetId] ?? defaultSpatialView
      if (previous.focusId === focusId) return state
      return {
        sheets: { ...state.sheets, [sheetId]: { mode: previous.mode, focusId } },
      }
    })
  },
  setCamera: (sheetId, camera) => {
    set((state) => ({
      sheets: {
        ...state.sheets,
        [sheetId]: { ...(state.sheets[sheetId] ?? defaultSpatialView), camera },
      },
    }))
  },
  reset: () => {
    set({ sheets: {} })
  },
}))

export const visibleSpatialFocus = (
  document: MindMapDocument,
  focusId: string | null,
): string | null => {
  if (!focusId || !document.topics[focusId] || focusId === document.rootId) return null
  let visibleId = focusId
  let parentId = getParentId(document, focusId)
  while (parentId) {
    if (document.topics[parentId]?.collapsed) visibleId = parentId
    parentId = getParentId(document, parentId)
  }
  return visibleId === document.rootId ? null : visibleId
}
