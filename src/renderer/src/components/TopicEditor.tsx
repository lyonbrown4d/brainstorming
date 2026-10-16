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
import { useEditor } from '../state/editor'
import type { EditingSurface } from '../state/editorTypes'
import { TopicEditorPlugin } from './TopicEditorPlugin'

export function TopicEditor({
  id,
  title,
  surface = 'canvas',
}: {
  id: string
  title: string
  surface?: EditingSurface
}) {
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
        configExtension(AutoFocusExtension, { disabled: surface !== 'canvas' }),
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
        useEditor.getState().setError(`主题编辑失败：${error.message}`)
      },
      $initialEditorState: () => {
        const state = useEditor.getState()
        const text =
          state.editingId === id && state.editingSurface === surface ? state.draft : committedTitle
        $getRoot().append($createParagraphNode().append($createTextNode(text)))
      },
    }),
  )
  return (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <div className="topic-editor-shell">
        <ContentEditable
          id={`topic-${surface}-${id}`}
          className={`${surface === 'canvas' ? 'topic-input' : surface === 'notes' ? 'topic-notes-input min-h-28 max-h-[280px] px-2.5 py-[9px] text-[13px] leading-relaxed' : 'topic-name-input min-h-[38px] max-h-[180px] px-2.5 py-2 text-sm leading-normal'} ${surface === 'canvas' ? '' : 'w-full overflow-y-auto rounded-[7px] border border-border bg-background text-foreground whitespace-pre-wrap [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_p]:m-0'} nodrag nopan nowheel`}
          aria-label={
            surface === 'notes'
              ? '主题备注'
              : surface === 'inspector'
                ? '主题名称'
                : active
                  ? '编辑主题标题'
                  : '主题内容'
          }
          aria-multiline
          spellCheck={false}
          data-topic-id={surface === 'canvas' ? id : undefined}
          onClick={(event) => {
            event.stopPropagation()
          }}
          onDoubleClick={(event) => {
            event.stopPropagation()
            useEditor.getState().startEdit(id, undefined, surface)
          }}
        />
      </div>
      <TopicEditorPlugin id={id} title={committedTitle} surface={surface} active={active} />
    </LexicalExtensionComposer>
  )
}
