import { translate } from '@renderer/i18n'
import { isDirty, useEditor } from '@renderer/state/editor'

export const confirmDiscard = (): boolean => {
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return false
  return !isDirty() || window.confirm(translate('thisMapHasUnsavedChangesDiscardThemLabel672'))
}
