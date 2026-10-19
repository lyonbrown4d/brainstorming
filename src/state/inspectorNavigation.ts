import { useEditor } from '@renderer/state/editor'
import type { CanvasPropertySection, InspectorMode } from '@renderer/state/editorTypes'

export const isCanvasSection = (value: unknown): value is CanvasPropertySection =>
  value === 'structure' || value === 'appearance' || value === 'template'

const ready = (): boolean => {
  if (useEditor.getState().busy) return false
  useEditor.getState().commitDraft()
  return !useEditor.getState().editingId
}

export const selectInspectorMode = (inspectorMode: InspectorMode): void => {
  if (ready()) useEditor.setState({ inspectorMode, inspectorOpen: true })
}

export const selectCanvasSection = (canvasSection: CanvasPropertySection): void => {
  if (ready()) useEditor.setState({ inspectorMode: 'canvas', canvasSection, inspectorOpen: true })
}

export const closeInspector = (): void => {
  if (ready()) useEditor.setState({ inspectorOpen: false })
}

export const toggleInspector = (): void => {
  if (!ready()) return
  const inspectorOpen = !useEditor.getState().inspectorOpen
  useEditor.setState({
    inspectorOpen,
    ...(inspectorOpen &&
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
      ? { outlineOpen: false }
      : {}),
  })
}
