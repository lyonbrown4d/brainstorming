import { isDirty, useEditor } from './editor'

export function confirmDiscard(): boolean {
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return false
  return !isDirty() || window.confirm('当前导图有未保存的更改。放弃这些更改并继续？')
}
