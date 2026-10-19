import { create } from 'zustand'

export type InkMode = 'select' | 'pen' | 'eraser'
interface CanvasInkState {
  mode: InkMode
  color: string
  width: number
}
export const useCanvasInk = create<CanvasInkState>(() => ({
  mode: 'select',
  color: '#48505e',
  width: 4,
}))
export const setInkMode = (mode: InkMode): void => {
  useCanvasInk.setState({ mode })
}
