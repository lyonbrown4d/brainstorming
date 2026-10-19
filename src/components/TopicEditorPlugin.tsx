import { indentOutlineTopic } from '@renderer/state/structuralEditing'
import { useEffect, useRef } from 'react'
import {
  $createParagraphNode,
  $createRangeSelectionFromDom,
  $createTextNode,
  $getRoot,
  $selectAll,
  $setSelection,
  BLUR_COMMAND,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  SKIP_DOM_SELECTION_TAG,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import type { EditingSurface } from '@renderer/state/editorTypes'
import { handleTopicNavigation, handleTopicShortcut } from '@renderer/state/editingShortcuts'
import { isCompositionKey, isPrimaryModifier } from '@renderer/state/keyboard'
import { shortcutIdForEvent } from '@renderer/state/shortcutLookup'

export const TopicEditorPlugin = ({
  id,
  title,
  surface,
  active,
}: {
  id: string
  title: string
  surface: EditingSurface
  active: boolean
}) => {
  const [editor] = useLexicalComposerContext()
  const nativeActivation = useRef(false)
  const playing = usePresentation((state) => state.playing)
  useEffect(() => {
    editor.setEditable(!playing)
  }, [editor, playing])
  useEffect(() => {
    const preserveNativeSelection = nativeActivation.current
    nativeActivation.current = false
    if (surface !== 'canvas') return
    if (editor.isComposing()) return
    if (active && preserveNativeSelection) return
    if (active) {
      editor.update(() => {
        if (useEditor.getState().editSelection === 'end') $getRoot().selectEnd()
        else $selectAll()
      })
    } else if (editor.getRootElement()?.contains(window.document.activeElement)) {
      editor.update(() => $selectAll())
    }
  }, [active, editor, surface])
  useEffect(() => {
    if (active || editor.isComposing()) return
    if (editor.read('latest', () => $getRoot().getTextContent()) !== title) {
      const focused = editor.getRootElement()?.contains(window.document.activeElement)
      editor.update(
        () => {
          $getRoot()
            .clear()
            .append($createParagraphNode().append($createTextNode(title)))
          // Restoring a cancelled canvas draft must also restore its replacement range.
          if (focused && surface === 'canvas') $selectAll()
        },
        { tag: focused ? ['topic-sync'] : ['topic-sync', SKIP_DOM_SELECTION_TAG] },
      )
    }
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
  }, [active, editor, title, surface])

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
        if (!ownsDraft()) {
          // The browser/Lexical already placed the caret (or owns an IME range).
          nativeActivation.current = true
          state.startEdit(id, text, surface, 'end')
        } else state.setDraft(text)
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
          // Native selectionchange may arrive after this keydown. Let Lexical resolve
          // the current DOM range before its own deletion commands consume it.
          if (ownsDraft() && (event.key === 'Backspace' || event.key === 'Delete')) {
            const root = editor.getRootElement()
            const nativeSelection = root?.ownerDocument.getSelection()
            if (
              nativeSelection &&
              root?.contains(nativeSelection.anchorNode) &&
              root.contains(nativeSelection.focusNode)
            ) {
              const selection = $createRangeSelectionFromDom(nativeSelection, editor)
              if (selection) $setSelection(selection)
            }
          }
          const state = useEditor.getState()
          const modifier = isPrimaryModifier(event)
          const key = event.key.toLowerCase()
          if (shortcutIdForEvent(event, 'global')) {
            commit()
            return false
          }
          const mapSurface = surface === 'canvas' || surface === 'outline'
          const mapAction = shortcutIdForEvent(event, 'map')
          if (
            mapSurface &&
            mapAction &&
            (!ownsDraft() ||
              ['search', 'root', 'zoomIn', 'zoomOut', 'actualSize', 'inspector'].includes(
                mapAction,
              ))
          ) {
            commit()
            if (!useEditor.getState().editingId) return handleTopicShortcut(event)
            event.preventDefault()
            return true
          }
          if (
            mapSurface &&
            modifier &&
            !event.altKey &&
            (key === 'k' || (event.shiftKey && ['n', 'r', 'b', 'i'].includes(key)))
          ) {
            commit()
            if (!useEditor.getState().editingId) return handleTopicShortcut(event)
            event.preventDefault()
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            if (ownsDraft()) state.cancelEdit()
            else if (mapSurface) handleTopicNavigation(event, id)
            return true
          }
          if (surface === 'notes') return false
          if (
            surface === 'outline' &&
            event.key === 'Tab' &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            event.preventDefault()
            commit()
            if (!useEditor.getState().editingId) {
              indentOutlineTopic(event.shiftKey ? -1 : 1)
              state.startEdit(id, undefined, 'outline')
            }
            return true
          }
          if (mapSurface && (!ownsDraft() || (modifier && key === 'enter'))) {
            if (handleTopicShortcut(event)) return true
            if (!ownsDraft() && handleTopicNavigation(event, id)) return true
          }
          // Unhandled modifier chords belong to the app/browser, never to topic creation.
          if (event.metaKey || event.ctrlKey || event.altKey) return false
          if (event.key === 'Tab' && event.shiftKey) return false
          if (event.key === 'Enter' && event.shiftKey) return false
          if (event.key === 'Enter' || event.key === 'Tab') {
            if (surface === 'inspector' && event.key === 'Tab') return false
            event.preventDefault()
            commit()
            if (useEditor.getState().editingId) return true
            if (!mapSurface && event.key === 'Enter') {
              editor.getRootElement()?.blur()
              return true
            }
            state.add(event.key === 'Tab' ? 'child' : 'sibling')
            if (surface === 'outline') {
              const next = useEditor.getState().editingId
              if (next) state.startEdit(next, undefined, 'outline')
            }
            return true
          }
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor, id, surface])
  return null
}
