import type { KeyboardEvent } from 'react'
import { useEditor } from '@renderer/state/editor'
import { isCompositionKey } from '@renderer/state/keyboard'
import { handleTopicShortcut } from '@renderer/state/editingShortcuts'
import { reorderSelectedTopic } from '@renderer/state/structuralEditing'
import {
  addOutlineTopic,
  indentOutlineSelection,
  runOutlineAction,
} from '@renderer/components/documents/OutlineWorkspaceActions'
import type { OutlineRow } from '@renderer/components/documents/OutlineWorkspaceModel'

export const useOutlineWorkspaceNavigation =
  (rows: readonly OutlineRow[], collapsed: readonly string[], onCollapse: (id: string) => void) =>
  (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || isCompositionKey(event.nativeEvent)) return
    if (event.target instanceof Element && event.target.closest('[contenteditable="true"]')) return
    const state = useEditor.getState()
    if (state.busy) return
    const index = rows.findIndex((row) => row.id === state.selectedId)
    const row = rows[index]
    if (!row) return
    const select = (id: string | undefined): void => {
      if (!id) return
      state.select(id)
      requestAnimationFrame(() => {
        window.document.getElementById(`outline-row-${id}`)?.focus()
      })
    }
    if (
      event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      ['ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      runOutlineAction(() => {
        reorderSelectedTopic(event.key === 'ArrowUp' ? -1 : 1)
      })
    } else if (handleTopicShortcut(event.nativeEvent)) {
      event.stopPropagation()
      return
    } else if (event.metaKey || event.ctrlKey || event.altKey) return
    else if (event.repeat && ['Enter', 'Tab'].includes(event.key)) {
      // Holding structural keys must never create or move an unbounded number of topics.
    } else if (event.key === 'ArrowDown') select(rows[index + 1]?.id)
    else if (event.key === 'ArrowUp') select(rows[index - 1]?.id)
    else if (event.key === 'Home') select(rows[0]?.id)
    else if (event.key === 'End') select(rows.at(-1)?.id)
    else if (event.key === 'ArrowLeft') {
      if (state.history.document.topics[row.id]?.children.length && !collapsed.includes(row.id))
        onCollapse(row.id)
      else select(row.parentId ?? undefined)
    } else if (event.key === 'ArrowRight') {
      if (collapsed.includes(row.id)) onCollapse(row.id)
      else if (rows[index + 1]?.parentId === row.id) select(rows[index + 1]?.id)
    } else if (event.key === 'Enter') addOutlineTopic('sibling')
    else if (event.key === 'Tab') indentOutlineSelection(event.shiftKey ? -1 : 1)
    else if (event.key === 'F2' || event.key === ' ') state.startEdit(row.id, undefined, 'outline')
    else if (event.key === 'Delete' || event.key === 'Backspace')
      runOutlineAction(() => {
        useEditor.getState().remove()
      })
    else if (event.key.length === 1) state.startEdit(row.id, event.key, 'outline', 'end')
    else return
    event.preventDefault()
    event.stopPropagation()
  }
