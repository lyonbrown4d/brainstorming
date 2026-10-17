import { translate } from '@renderer/i18n'
import { getParentId, type Command } from '@core'
import { useEditor } from '@renderer/state/editor'

/** Reveal a folded parent and create its child as a single undoable operation. */
export const addTopic = (kind: 'child' | 'sibling'): void => {
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
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
      ? parent.children.indexOf(selectedId) + 1
      : parent.children.length
  const add: Command = { type: 'addTopic', parentId, id, title: translate('newTopic'), side, index }
  const command: Command = parent.collapsed
    ? { type: 'batch', commands: [{ type: 'toggleCollapse', topicId: parentId }, add] }
    : add
  if (useEditor.getState().command(command)) useEditor.getState().startEdit(id)
}
