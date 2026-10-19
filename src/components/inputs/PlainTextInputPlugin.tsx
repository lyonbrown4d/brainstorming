import { useEffect, useRef } from 'react'
import { $restoreEditorState } from '@lexical/utils'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  BLUR_COMMAND,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMPOSITION_END_COMMAND,
  FOCUS_COMMAND,
  KEY_DOWN_COMMAND,
  SKIP_DOM_SELECTION_TAG,
  mergeRegister,
} from 'lexical'
import type { PlainTextInputProps } from '@renderer/components/inputs/PlainTextInput'
import { isCompositionKey } from '@renderer/state/keyboard'

const SYNC_TAG = 'plain-input-sync'
const LIMIT_TAG = 'plain-input-limit'

export const PlainTextInputPlugin = ({
  value,
  onValueChange,
  disabled = false,
  maxLength,
  submitMode,
  onFocus,
  onBlur,
  onSubmit,
  onCancel,
}: PlainTextInputProps) => {
  const [editor] = useLexicalComposerContext()
  const published = useRef(value)
  const pendingReset = useRef<string | null>(null)
  const pendingBlur = useRef(false)
  const validState = useRef(editor.getEditorState())

  useEffect(() => {
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (value === published.current) {
      pendingReset.current = null
      return
    }
    pendingReset.current = value
    if (editor.isComposing()) return
    pendingReset.current = null
    published.current = value
    editor.update(
      () =>
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode(value))),
      { tag: [SYNC_TAG, SKIP_DOM_SELECTION_TAG], discrete: true },
    )
    validState.current = editor.getEditorState()
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
  }, [editor, value])

  useEffect(() => {
    const read = (): string => editor.read('latest', () => $getRoot().getTextContent())
    const flush = (): void => {
      if (editor.isComposing()) return
      const reset = pendingReset.current
      if (reset !== null) {
        pendingReset.current = null
        published.current = reset
        editor.update(
          () =>
            $getRoot()
              .clear()
              .append($createParagraphNode().append($createTextNode(reset))),
          { tag: [SYNC_TAG, SKIP_DOM_SELECTION_TAG], discrete: true },
        )
        validState.current = editor.getEditorState()
        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
      }
      const text = read()
      if (maxLength !== undefined && text.length > maxLength) {
        editor.update(
          () => {
            $restoreEditorState(editor, validState.current)
          },
          { tag: LIMIT_TAG, discrete: true },
        )
        const validText = read()
        published.current = validText
        onValueChange(validText)
      }
      if (pendingBlur.current) {
        pendingBlur.current = false
        onBlur?.(read())
      }
    }
    return mergeRegister(
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        if (tags.has(SYNC_TAG) || tags.has(LIMIT_TAG)) return
        if (!dirtyElements.size && !dirtyLeaves.size) return
        if (pendingReset.current !== null) {
          queueMicrotask(flush)
          return
        }
        const text = editorState.read(() => $getRoot().getTextContent())
        // Validate whole edits after IME completion, leaving Lexical's live range untouched.
        if (maxLength !== undefined && text.length > maxLength) {
          if (!editor.isComposing())
            editor.update(
              () => {
                $restoreEditorState(editor, validState.current)
              },
              { tag: LIMIT_TAG, discrete: true },
            )
          return
        }
        if (!editor.isComposing()) validState.current = editorState
        if (published.current !== text) {
          published.current = text
          onValueChange(text)
        }
        if (pendingBlur.current) queueMicrotask(flush)
      }),
      editor.registerCommand(
        COMPOSITION_END_COMMAND,
        () => {
          queueMicrotask(flush)
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          onFocus?.()
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          if (editor.isComposing()) pendingBlur.current = true
          else onBlur?.(read())
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (onCancel) event.stopPropagation()
          if (editor.isComposing() || isCompositionKey(event)) {
            event.stopPropagation()
            return ['Enter', 'Escape', 'Tab'].includes(event.key)
          }
          if (event.key === 'Escape' && onCancel) {
            event.preventDefault()
            pendingBlur.current = false
            onCancel()
            return true
          }
          if (
            event.key === 'Enter' &&
            onSubmit &&
            (submitMode === 'enter' || !event.shiftKey) &&
            (submitMode === 'enter' ||
              (submitMode === 'modifier-enter' && (event.metaKey || event.ctrlKey)))
          ) {
            event.preventDefault()
            onSubmit(read())
            return true
          }
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor, maxLength, onBlur, onCancel, onFocus, onSubmit, onValueChange, submitMode])
  return null
}
