import { useEffect } from 'react'
import { useCommandPaletteState } from '@renderer/state/commandPalette'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { newDocument, openDocument, saveDocument } from '@renderer/state/files'
import { isCompositionKey } from '@renderer/state/keyboard'
import { handleTopicNavigation, handleTopicShortcut } from '@renderer/state/editingShortcuts'
import { useWorkspace } from '@renderer/state/workspace'
import { handleAnnotationKey } from '@renderer/state/annotationInteraction'
import { cancelCreation } from '@renderer/state/creation'
import { closeActiveDocument, nextDocumentTab } from '@renderer/state/documentTabs'

export const useKeyboardShortcuts = (): void => {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (
        isCompositionKey(event) ||
        event.defaultPrevented ||
        useCommandPaletteState.getState().open
      )
        return
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[role="menu"], [role="dialog"], [role="menuitem"]')
      )
        return
      if (usePresentation.getState().playing) return
      const state = useEditor.getState()
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault()
        nextDocumentTab(event.shiftKey ? -1 : 1)
        return
      }
      if (modifier && key === 'w' && !event.shiftKey) {
        event.preventDefault()
        closeActiveDocument()
        return
      }
      if (modifier && ['s', 'o', 'n'].includes(key)) {
        event.preventDefault()
        if (key === 's') void saveDocument(event.shiftKey)
        else if (key === 'o') void openDocument()
        else newDocument()
        return
      }
      if (useWorkspace.getState().screen !== 'editor') {
        if (event.key === 'Escape') cancelCreation()
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
      if (handleAnnotationKey(event)) return
      if (handleTopicShortcut(event)) return
      if (modifier && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (target instanceof HTMLElement && target.closest('button')) return
      handleTopicNavigation(event)
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [])
}
