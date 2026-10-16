import { useEffect } from 'react'
import { useEditor } from '../state/editor'
import { newDocument, openDocument, saveDocument } from '../state/files'
import { getNavigationTarget, isCompositionKey } from '../state/keyboard'
import { handleTopicShortcut } from '../state/editingShortcuts'

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (isCompositionKey(event) || event.defaultPrevented) return
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[role="menu"], [role="dialog"], [role="menuitem"]')
      )
        return
      const state = useEditor.getState()
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (modifier && ['s', 'o', 'n'].includes(key)) {
        event.preventDefault()
        if (key === 's') void saveDocument(event.shiftKey)
        else if (key === 'o') void openDocument()
        else newDocument()
        return
      }
      if (modifier && key === 'f') {
        state.commitDraft()
        if (!useEditor.getState().editingId) handleTopicShortcut(event)
        else event.preventDefault()
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return
      if (handleTopicShortcut(event)) return
      if (modifier && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (modifier || event.altKey || (target instanceof HTMLElement && target.closest('button')))
        return
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        const next = getNavigationTarget(state.history.document, state.selectedId, event.key)
        if (next) state.select(next)
      } else if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault()
        state.add(event.key === 'Tab' ? 'child' : 'sibling')
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        state.remove()
      } else if (event.key === 'F2') {
        event.preventDefault()
        state.startEdit(state.selectedId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [])
}
