import { translate } from '@renderer/i18n'
import { getParentId, type Command } from '@core'
import { useEditor } from '@renderer/state/editor'
import { flushNativeEditor, hasPendingNativeEditor } from '@renderer/state/nativeEditorQueue'

/** Reveal a folded parent and create its child as a single undoable operation. */
export const addTopic = (kind: 'child' | 'sibling', before = false): void => {
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  const source = useEditor.getState()
  if (hasPendingNativeEditor(source.workbook.id)) {
    void flushNativeEditor(source.workbook.id)
      .then(() => {
        const current = useEditor.getState()
        if (
          current.workbook.id === source.workbook.id &&
          current.activeSheetId === source.activeSheetId
        )
          addTopic(kind, before)
      })
      .catch((error: unknown) => {
        if (useEditor.getState().workbook.id === source.workbook.id)
          useEditor.getState().setError(error instanceof Error ? error.message : String(error))
      })
    return
  }
  const {
    history: { document },
    selectedId,
  } = useEditor.getState()
  const parentId = kind === 'child' ? selectedId : (getParentId(document, selectedId) ?? selectedId)
  const parent = document.topics[parentId]
  if (!parent) return
  const id = crypto.randomUUID()
  const current = document.topics[selectedId]
  const side =
    parentId === document.rootId && selectedId === document.rootId
      ? parent.children.length % 2 === 0
        ? 'right'
        : 'left'
      : (current?.side ?? 'right')
  const index =
    kind === 'sibling' && selectedId !== document.rootId
      ? parent.children.indexOf(selectedId) + (before ? 0 : 1)
      : parent.children.length
  const add: Command = { type: 'addTopic', parentId, id, title: translate('newTopic'), side, index }
  const command: Command = parent.collapsed
    ? { type: 'batch', commands: [{ type: 'toggleCollapse', topicId: parentId }, add] }
    : add
  if (useEditor.getState().command(command)) useEditor.getState().startEdit(id)
}
