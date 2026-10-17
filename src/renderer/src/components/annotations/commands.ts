import type { Command } from '@core'
import { useEditor } from '@renderer/state/editor'

export const runAnnotationCommand = (command: Command): boolean => {
  const editor = useEditor.getState()
  if (editor.busy) return false
  editor.commitDraft()
  if (useEditor.getState().editingId) return false
  return useEditor.getState().command(command)
}
