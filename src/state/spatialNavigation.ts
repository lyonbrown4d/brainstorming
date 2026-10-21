import { create } from 'zustand'

interface SpatialNavigationState {
  readonly orbit: boolean
  setOrbit: (orbit: boolean) => void
  toggleOrbit: () => void
}

/** A session preference: it never changes the document or undo stack. */
export const useSpatialNavigation = create<SpatialNavigationState>((set) => ({
  orbit: false,
  setOrbit: (orbit) => {
    set({ orbit })
  },
  toggleOrbit: () => {
    set((state) => ({ orbit: !state.orbit }))
  },
}))
