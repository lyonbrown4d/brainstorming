import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface CanvasPreferences {
  minimap: boolean
  setMinimap: (visible: boolean) => void
}

export const useCanvasPreferences = create<CanvasPreferences>()(
  persist(
    (set) => ({
      minimap: true,
      setMinimap: (minimap) => set({ minimap }),
    }),
    {
      name: 'brainstorming-canvas-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ minimap }) => ({ minimap }),
    },
  ),
)
