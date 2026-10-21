import { create } from 'zustand'
import type { SpatialSettings } from '@core'
import { useEditor } from '@renderer/state/editor'

export type SpatialView = SpatialSettings

export const DEFAULT_SPATIAL_VIEW: SpatialView = Object.freeze({
  mode: '2d',
  yaw: 0.7,
  pitch: 0.5,
  spacing: 100,
})

const viewKey = (workbookId: string, sheetId: string): string =>
  JSON.stringify([workbookId, sheetId])

const persistedView = (workbookId: string, sheetId: string): SpatialView => {
  const editor = useEditor.getState()
  return editor.workbook.id === workbookId && editor.activeSheetId === sheetId
    ? (editor.history.document.settings?.spatial ?? DEFAULT_SPATIAL_VIEW)
    : DEFAULT_SPATIAL_VIEW
}

const bounded = (value: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

interface SpatialViewState {
  readonly views: Readonly<Record<string, SpatialView>>
  setView: (workbookId: string, sheetId: string, patch: Partial<SpatialView>) => void
  clearView: (workbookId: string, sheetId: string) => void
}

/** Transient camera previews are cleared after their document command resolves. */
export const useSpatialView = create<SpatialViewState>((set) => ({
  views: {},
  clearView: (workbookId, sheetId) => {
    set((state) => {
      const key = viewKey(workbookId, sheetId)
      if (!state.views[key]) return state
      const views = Object.fromEntries(Object.entries(state.views).filter(([id]) => id !== key))
      return { views }
    })
  },
  setView: (workbookId, sheetId, patch) => {
    set((state) => {
      const key = viewKey(workbookId, sheetId)
      const before = state.views[key] ?? persistedView(workbookId, sheetId)
      const previousTarget = before.target
      const target =
        patch.target === undefined
          ? previousTarget
          : {
              x: bounded(patch.target.x, -1_000_000, 1_000_000, previousTarget?.x ?? 0),
              y: bounded(patch.target.y, -1_000_000, 1_000_000, previousTarget?.y ?? 0),
              z: bounded(patch.target.z, -1_000_000, 1_000_000, previousTarget?.z ?? 0),
            }
      const after: SpatialView = {
        mode: patch.mode === '2d' || patch.mode === '3d' ? patch.mode : before.mode,
        yaw:
          patch.yaw === undefined ? before.yaw : bounded(patch.yaw, -Math.PI, Math.PI, before.yaw),
        pitch:
          patch.pitch === undefined
            ? before.pitch
            : bounded(patch.pitch, -Math.PI / 2, Math.PI / 2, before.pitch),
        spacing:
          patch.spacing === undefined
            ? before.spacing
            : bounded(patch.spacing, 0, 200, before.spacing),
        ...(target === undefined ? {} : { target }),
      }
      if (
        after.mode === before.mode &&
        after.yaw === before.yaw &&
        after.pitch === before.pitch &&
        after.spacing === before.spacing &&
        (after.target === before.target ||
          (after.target?.x === before.target?.x &&
            after.target?.y === before.target?.y &&
            after.target?.z === before.target?.z))
      )
        return state
      return { views: { ...state.views, [key]: after } }
    })
  },
}))

export const getSpatialView = (workbookId: string, sheetId: string): SpatialView =>
  useSpatialView.getState().views[viewKey(workbookId, sheetId)] ??
  persistedView(workbookId, sheetId)
