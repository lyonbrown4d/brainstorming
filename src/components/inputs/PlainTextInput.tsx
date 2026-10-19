import { useId, useState } from 'react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $selectAll,
  configExtension,
  defineExtension,
} from 'lexical'
import { AutoFocusExtension } from '@lexical/extension'
import { PlainTextExtension } from '@lexical/plain-text'
import { HistoryExtension } from '@lexical/history'
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { PlainTextInputPlugin } from '@renderer/components/inputs/PlainTextInputPlugin'
import { cn } from '@renderer/lib/utils'
import { useEditor } from '@renderer/state/editor'

export interface PlainTextInputProps {
  value: string
  onValueChange: (value: string) => void
  label: string
  id?: string
  className?: string
  placeholder?: string
  disabled?: boolean
  maxLength?: number
  focusOnMount?: boolean
  selectAllOnFocus?: boolean
  submitMode?: 'enter' | 'modifier-enter'
  onFocus?: () => void
  onBlur?: (value: string) => void
  onSubmit?: (value: string) => void
  onCancel?: () => void
}

/** Literal text with Lexical's composition, clipboard, selection and local undo. */
export const PlainTextInput = (props: PlainTextInputProps) => {
  const namespace = useId()
  const [extension] = useState(() =>
    defineExtension({
      name: `brainstorming/input-${namespace}`,
      namespace: `brainstorming/input-${namespace}`,
      dependencies: [
        PlainTextExtension,
        HistoryExtension,
        configExtension(AutoFocusExtension, { disabled: !props.focusOnMount || !!props.disabled }),
      ],
      $initialEditorState: () => {
        $getRoot().append($createParagraphNode().append($createTextNode(props.value)))
        if (props.focusOnMount && props.selectAllOnFocus) $selectAll()
      },
      onError: (error: Error) => {
        useEditor.getState().setError(error.message)
      },
    }),
  )
  return (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <div className="relative min-w-0">
        <ContentEditable
          id={props.id}
          aria-label={props.label}
          aria-multiline
          aria-disabled={props.disabled ?? false}
          aria-placeholder={props.placeholder ?? ''}
          spellCheck={false}
          className={cn(
            'nodrag nopan nowheel min-h-20 w-full select-text overflow-y-auto rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-pre-wrap shadow-xs outline-none [overflow-wrap:anywhere] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_p]:m-0',
            props.className,
          )}
          placeholder={() =>
            props.placeholder ? (
              <span className="pointer-events-none absolute top-2 left-3 text-sm text-muted-foreground">
                {props.placeholder}
              </span>
            ) : null
          }
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
        />
      </div>
      <PlainTextInputPlugin {...props} />
    </LexicalExtensionComposer>
  )
}
