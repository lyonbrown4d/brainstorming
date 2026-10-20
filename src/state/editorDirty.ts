import type { EditorState } from '@renderer/state/editorTypes'
import { useEditor } from '@renderer/state/editor'
import { snapshotIsDirty } from '@renderer/state/documentSnapshot'
import { hasPendingNativeEditor } from '@renderer/state/nativeEditorQueue'

export const editorIsDirty = (state: EditorState): boolean => {
  try {
    return snapshotIsDirty(state) || hasPendingNativeEditor(state.workbook.id)
  } catch {
    return true
  }
}

export const isDirty = (): boolean => editorIsDirty(useEditor.getState())
