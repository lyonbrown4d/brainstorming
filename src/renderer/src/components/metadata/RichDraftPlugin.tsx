import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  registerMarkdownShortcuts,
} from '@lexical/markdown'
import { mergeRegister } from '@lexical/utils'
import {
  $getRoot,
  BLUR_COMMAND,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH,
  FOCUS_COMMAND,
  KEY_DOWN_COMMAND,
  SKIP_DOM_SELECTION_TAG,
} from 'lexical'
import { useEditor } from '../../state/editor'
import { isCompositionKey } from '../../state/keyboard'
import { handleTopicShortcut } from '../../state/editingShortcuts'
import { richTransformers } from './richTransformers'

export function RichDraftPlugin({
  topicId,
  source,
  title,
}: {
  topicId: string
  source: string
  title: boolean
}) {
  const [editor] = useLexicalComposerContext()
  const surface = title ? 'rich-title' : 'notes'
  const active = useEditor(
    (state) => state.editingId === topicId && state.editingSurface === surface,
  )
  useEffect(() => {
    if (active || editor.isComposing()) return
    if (
      editor.read('latest', () => $convertToMarkdownString(richTransformers, undefined, true)) !==
      source
    )
      editor.update(
        () => {
          $convertFromMarkdownString(source, richTransformers, undefined, true)
        },
        { tag: ['rich-sync', SKIP_DOM_SELECTION_TAG] },
      )
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
  }, [active, editor, source])
  useEffect(() => {
    const ownsDraft = (): boolean => {
      const state = useEditor.getState()
      return state.editingId === topicId && state.editingSurface === surface
    }
    const synchronize = (): void => {
      const content = editor.read('latest', () => ({
        markdown: $convertToMarkdownString(richTransformers, undefined, true),
        text: $getRoot().getTextContent(),
      }))
      const state = useEditor.getState()
      if (!ownsDraft()) state.startEdit(topicId, title ? content.text : content.markdown, surface)
      if (!ownsDraft()) return
      if (title) state.setRichDraft(content.markdown, content.text)
      else state.setDraft(content.markdown)
    }
    const commit = (): void => {
      if (!ownsDraft() || editor.isComposing()) return
      synchronize()
      useEditor.getState().commitDraft()
    }
    return mergeRegister(
      registerMarkdownShortcuts(editor, richTransformers),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          synchronize()
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, tags }) => {
        if (tags.has('rich-sync') || (!dirtyElements.size && !dirtyLeaves.size)) return
        synchronize()
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
          if (editor.isComposing() || isCompositionKey(event)) {
            event.stopPropagation()
            if (
              (event.metaKey || event.ctrlKey) &&
              ['s', 'o', 'n', 'f'].includes(event.key.toLowerCase())
            )
              event.preventDefault()
            return false
          }
          const key = event.key.toLowerCase()
          const modifier = event.ctrlKey || event.metaKey
          if (modifier && ['s', 'o', 'n', 'f'].includes(key)) {
            commit()
            if (key === 'f' && !useEditor.getState().editingId) return handleTopicShortcut(event)
            return false
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            useEditor.getState().cancelEdit()
            editor.getRootElement()?.blur()
            return true
          }
          if (title && event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            commit()
            editor.getRootElement()?.blur()
            return true
          }
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor, surface, title, topicId])
  return null
}
