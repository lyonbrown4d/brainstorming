import { useMessages } from '@renderer/i18n/useMessages'

import { useState } from 'react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $selectAll,
  FOCUS_COMMAND,
  COMMAND_PRIORITY_HIGH,
  configExtension,
  defineExtension,
} from 'lexical'
import { AutoFocusExtension } from '@lexical/extension'
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer'
import { PlainTextExtension } from '@lexical/plain-text'
import { HistoryExtension } from '@lexical/history'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { interactAnnotationTopic } from '@renderer/state/annotationInteraction'
import { selectTopic } from '@renderer/state/selection'
import type { EditingSurface } from '@renderer/state/editorTypes'
import { TopicEditorPlugin } from '@renderer/components/TopicEditorPlugin'

export const TopicEditor = ({
  id,
  title,
  surface = 'canvas',
}: {
  id: string
  title: string
  surface?: EditingSurface
}) => {
  const { translate } = useMessages()

  const active = useEditor((state) => state.editingId === id && state.editingSurface === surface)
  const committedTitle = useEditor((state) => {
    const topic = state.history.document.topics[id]
    return surface === 'notes' ? (topic?.notes ?? '') : (topic?.title ?? title)
  })
  // Lexical owns composition and selection. Never replace its state on each keystroke.
  const [extension] = useState(() =>
    defineExtension({
      name: `trelyx/topic-${surface}-${id}`,
      namespace: `topic-${surface}-${id}`,
      dependencies: [
        PlainTextExtension,
        HistoryExtension,
        configExtension(AutoFocusExtension, {
          disabled: surface !== 'canvas' && surface !== 'spatial',
        }),
      ],
      register: (editor) =>
        editor.registerCommand(
          FOCUS_COMMAND,
          () => {
            const state = useEditor.getState()
            if (surface !== 'canvas') state.startEdit(id, undefined, surface)
            else if (state.editingId !== id || state.editingSurface !== surface) $selectAll()
            return false
          },
          COMMAND_PRIORITY_HIGH,
        ),
      onError: (error: Error) => {
        useEditor
          .getState()
          .setError(translate('couldNotEditTopicValue0', { value0: error.message }))
      },
      $initialEditorState: () => {
        const state = useEditor.getState()
        const text =
          state.editingId === id && state.editingSurface === surface ? state.draft : committedTitle
        $getRoot().append($createParagraphNode().append($createTextNode(text)))
        if (surface === 'canvas' || surface === 'spatial') {
          if (state.editSelection === 'end') $getRoot().selectEnd()
          else $selectAll()
        }
      },
    }),
  )
  return (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <div
        className={
          surface === 'spatial'
            ? 'flex max-h-[inherit] min-w-0 w-full items-center justify-center'
            : 'topic-editor-shell'
        }
      >
        <ContentEditable
          id={`topic-${surface}-${id}`}
          className={`${surface === 'canvas' ? 'topic-input' : surface === 'spatial' ? 'min-h-[1.5em] max-h-[inherit] w-full overflow-y-auto border-0 bg-transparent p-0 text-center text-inherit leading-[1.5] whitespace-pre-wrap [font:inherit] [overflow-wrap:anywhere] outline-none [&_p]:m-0' : surface === 'notes' ? 'topic-notes-input min-h-28 max-h-[280px] px-2.5 py-[9px] text-[13px] leading-relaxed' : 'topic-name-input min-h-[38px] max-h-[180px] px-2.5 py-2 text-sm leading-normal'} ${surface === 'canvas' || surface === 'spatial' ? '' : 'w-full overflow-y-auto rounded-[7px] border border-border bg-background text-foreground whitespace-pre-wrap [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_p]:m-0'} select-text nodrag nopan nowheel`}
          aria-label={
            surface === 'outline'
              ? translate('outlineTopicTitle')
              : surface === 'notes'
                ? translate('topicNotes')
                : surface === 'inspector'
                  ? translate('topicTitle')
                  : active || surface === 'spatial'
                    ? translate('editTopicTitle')
                    : translate('topicContent')
          }
          aria-multiline
          spellCheck={false}
          data-topic-id={surface === 'canvas' || surface === 'spatial' ? id : undefined}
          onClick={(event) => {
            event.stopPropagation()
            if (surface === 'canvas' && interactAnnotationTopic(id)) return
            if (!active && (event.metaKey || event.ctrlKey || event.shiftKey)) selectTopic(id, true)
          }}
          onDoubleClick={(event) => {
            if (usePresentation.getState().playing) return
            event.stopPropagation()
            useEditor
              .getState()
              .startEdit(
                id,
                undefined,
                surface,
                title === translate('newTopic') || title === translate('floatingTopic')
                  ? 'all'
                  : 'end',
              )
          }}
        />
      </div>
      <TopicEditorPlugin id={id} title={committedTitle} surface={surface} active={active} />
    </LexicalExtensionComposer>
  )
}
