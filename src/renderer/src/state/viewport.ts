import { create } from 'zustand'

export type ViewportAction = 'zoomIn' | 'zoomOut' | 'actualSize' | 'centerRoot'
export const useViewportRequest = create<{ action: ViewportAction | null; sequence: number }>(
  () => ({
    action: null,
    sequence: 0,
  }),
)

/** View operations never enter document history. */
export function requestViewport(action: ViewportAction): void {
  useViewportRequest.setState((state) => ({ action, sequence: state.sequence + 1 }))
}
