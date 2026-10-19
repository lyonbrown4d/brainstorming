import { useLocation, useNavigate } from 'react-router'
import { commitWorkspaceNavigation } from '@renderer/routing/workspaceNavigation'
import { useEffect } from 'react'
import { useCommandPaletteState } from '@renderer/state/commandPalette'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { newDocument, openDocument, saveDocument } from '@renderer/state/files'
import { isCompositionKey } from '@renderer/state/keyboard'
import { handleTopicNavigation, handleTopicShortcut } from '@renderer/state/editingShortcuts'
import { shortcutIdForEvent } from '@renderer/state/shortcutLookup'
import { useWorkspace } from '@renderer/state/workspace'
import { handleAnnotationKey } from '@renderer/state/annotationInteraction'
import { cancelCreation } from '@renderer/state/creation'
import { closeActiveDocument, nextDocumentTab } from '@renderer/state/documentTabs'
import type { ShortcutId } from '@renderer/state/shortcutRegistry'

export const useKeyboardShortcuts = (): void => {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const runGlobal = (action: ShortcutId): void => {
      if (action === 'settings') {
        if (location.pathname !== '/settings' && commitWorkspaceNavigation())
          void navigate('/settings', { state: { settingsReturnTo: location.pathname } })
      } else if (action === 'close') closeActiveDocument()
      else if (action === 'save') void saveDocument(false)
      else if (action === 'saveAs') void saveDocument(true)
      else if (action === 'open') void openDocument()
      else if (action === 'new') newDocument()
    }
    const handler = (event: KeyboardEvent): void => {
      if (
        isCompositionKey(event) ||
        event.defaultPrevented ||
        useCommandPaletteState.getState().open
      )
        return
      if (
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="dialog"], [role="menuitem"]')
      )
        return
      if (usePresentation.getState().playing) return
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
        event.preventDefault()
        if (!event.repeat) nextDocumentTab(event.shiftKey ? -1 : 1)
        return
      }
      const global = shortcutIdForEvent(event, 'global')
      if (global) {
        event.preventDefault()
        if (!event.repeat) runGlobal(global)
        return
      }
      if (useWorkspace.getState().screen !== 'editor') {
        if (event.key === 'Escape') cancelCreation()
        return
      }
      const state = useEditor.getState()
      const target = event.target
      const editing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (editing) {
        if (shortcutIdForEvent(event, 'map') === 'search') {
          state.commitDraft()
          if (!useEditor.getState().editingId) handleTopicShortcut(event)
          else event.preventDefault()
        }
        return
      }
      if (handleAnnotationKey(event)) return
      if (handleTopicShortcut(event)) return
      if (target instanceof Element && target.closest('button')) return
      handleTopicNavigation(event)
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [location.pathname, navigate])
}
