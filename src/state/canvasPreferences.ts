import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface CanvasPreferences {
  topDockPinned: boolean
  bottomDockPinned: boolean
  setDockPinned: (edge: 'top' | 'bottom', pinned: boolean) => void
  minimap: boolean
  setMinimap: (visible: boolean) => void
}

export const useCanvasPreferences = create<CanvasPreferences>()(
  persist(
    (set) => ({
      topDockPinned: false,
      bottomDockPinned: false,
      setDockPinned: (edge, pinned) =>
        set(edge === 'top' ? { topDockPinned: pinned } : { bottomDockPinned: pinned }),
      minimap: true,
      setMinimap: (minimap) => set({ minimap }),
    }),
    {
      name: 'brainstorming-canvas-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ minimap, topDockPinned, bottomDockPinned }) => ({
        minimap,
        topDockPinned,
        bottomDockPinned,
      }),
    },
  ),
)
