import { create } from 'zustand'

interface OutlineSession {
  readonly open: boolean
  readonly collapsed: readonly string[]
  readonly scrollTop: number
}

export const emptyOutlineSession: OutlineSession = { open: false, collapsed: [], scrollTop: 0 }

/** Editing view preferences belong to the current session, never document history. */
export const useOutlineWorkspaceState = create<{
  readonly sessions: Readonly<Record<string, OutlineSession>>
}>(() => ({ sessions: {} }))

export const outlineSessionKey = (workbookId: string, sheetId: string): string =>
  JSON.stringify([workbookId, sheetId])

export const updateOutlineSession = (key: string, patch: Partial<OutlineSession>): void => {
  useOutlineWorkspaceState.setState((state) => ({
    sessions: {
      // Keep the most recently used work views without retaining every closed workbook.
      ...Object.fromEntries(
        Object.entries(state.sessions)
          .filter(([id]) => id !== key)
          .slice(-127),
      ),
      [key]: { ...(state.sessions[key] ?? emptyOutlineSession), ...patch },
    },
  }))
}
