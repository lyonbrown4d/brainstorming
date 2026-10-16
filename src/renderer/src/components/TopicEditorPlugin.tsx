import { useEffect } from 'react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $selectAll,
  BLUR_COMMAND,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  SKIP_DOM_SELECTION_TAG,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEditor } from '../state/editor'
import type { EditingSurface } from '../state/editorTypes'
import { handleTopicShortcut } from '../state/editingShortcuts'
import { getNavigationTarget, isCompositionKey } from '../state/keyboard'

export function TopicEditorPlugin({
  id,
  title,
  surface,
  active,
}: {
  id: string
  title: string
  surface: EditingSurface
  active: boolean
}) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (active || editor.isComposing()) return
    if (editor.read('latest', () => $getRoot().getTextContent()) !== title)
      editor.update(
        () =>
          $getRoot()
            .clear()
            .append($createParagraphNode().append($createTextNode(title))),
        { tag: ['topic-sync', SKIP_DOM_SELECTION_TAG] },
      )
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
  }, [active, editor, title])

  useEffect(() => {
    const ownsDraft = (): boolean => {
      const state = useEditor.getState()
      return state.editingId === id && state.editingSurface === surface
    }
    const commit = (): void => {
      if (!ownsDraft() || editor.isComposing()) return
      const text = editor.read('latest', () => $getRoot().getTextContent())
      useEditor.getState().setDraft(text)
      useEditor.getState().commitDraft()
    }
    return mergeRegister(
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        if (tags.has('topic-sync') || (dirtyElements.size === 0 && dirtyLeaves.size === 0)) return
        const text = editorState.read(() => $getRoot().getTextContent())
        const state = useEditor.getState()
        const topic = state.history.document.topics[id]
        const committed = surface === 'notes' ? (topic?.notes ?? '') : topic?.title
        if (!ownsDraft() && text === committed) return
        if (!ownsDraft()) state.startEdit(id, text, surface)
        else state.setDraft(text)
        if (!editor.getRootElement()?.contains(window.document.activeElement)) commit()
      }),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          commit()
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          // Lexical handles the native composition; these guards only isolate map commands.
          if (editor.isComposing() || isCompositionKey(event)) {
            event.stopPropagation()
            if (
              (event.metaKey || event.ctrlKey) &&
              ['s', 'o', 'n'].includes(event.key.toLowerCase())
            )
              event.preventDefault()
            return false
          }
          const state = useEditor.getState()
          const modifier = event.metaKey || event.ctrlKey
          const key = event.key.toLowerCase()
          if (modifier && ['s', 'o', 'n'].includes(key)) {
            commit()
            return false
          }
          if (modifier && key === 'f') {
            commit()
            if (!useEditor.getState().editingId) return handleTopicShortcut(event)
            event.preventDefault()
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            if (ownsDraft()) state.cancelEdit()
            return true
          }
          if (surface === 'notes' && (event.key === 'Enter' || event.key === 'Tab')) return false
          if (event.key === 'Enter' && event.shiftKey) return false
          if (event.key === 'Enter' || event.key === 'Tab') {
            if (surface === 'inspector') {
              if (event.key === 'Tab') return false
              event.preventDefault()
              commit()
              editor.getRootElement()?.blur()
              return true
            }
            event.preventDefault()
            commit()
            state.add(event.key === 'Tab' ? 'child' : 'sibling')
            if (surface === 'outline') {
              const next = useEditor.getState().editingId
              if (next) state.startEdit(next, undefined, 'outline')
            }
            return true
          }
          if (
            (surface === 'canvas' || surface === 'spatial' || surface === 'outline') &&
            !ownsDraft()
          ) {
            if (key !== 'a' && handleTopicShortcut(event)) return true
            if (event.key === 'Delete' || event.key === 'Backspace') {
              event.preventDefault()
              state.remove()
              return true
            }
            if (modifier && key === 'z') {
              event.preventDefault()
              if (event.shiftKey) state.redo()
              else state.undo()
              return true
            }
            if (!modifier && event.key.startsWith('Arrow')) {
              const next = getNavigationTarget(state.history.document, id, event.key)
              if (next) state.select(next)
              event.preventDefault()
              return true
            }
            if (event.key === 'F2') {
              event.preventDefault()
              $selectAll()
              state.startEdit(id)
              return true
            }
          }
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor, id, surface])
  return null
}
