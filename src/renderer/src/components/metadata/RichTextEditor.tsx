import { useState } from 'react'
import { defineExtension } from 'lexical'
import { RichTextExtension } from '@lexical/rich-text'
import { HistoryExtension } from '@lexical/history'
import { ListExtension } from '@lexical/list'
import { LinkExtension } from '@lexical/link'
import { $convertFromMarkdownString } from '@lexical/markdown'
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { useEditor } from '../../state/editor'
import { RichDraftPlugin } from './RichDraftPlugin'
import { RichTextToolbar } from './RichTextToolbar'
import { richTransformers } from './richTransformers'

export function RichTextEditor({
  topicId,
  source,
  title = false,
}: {
  topicId: string
  source: string
  title?: boolean
}) {
  const [extension] = useState(() =>
    defineExtension({
      name: `trelyx/rich-${title ? 'title' : 'notes'}-${topicId}`,
      namespace: `trelyx/rich-${title ? 'title' : 'notes'}-${topicId}`,
      dependencies: [RichTextExtension, HistoryExtension, ListExtension, LinkExtension],
      theme: {
        text: {
          bold: 'font-bold',
          italic: 'italic',
          strikethrough: 'line-through',
          code: 'rounded bg-muted px-1 font-mono',
        },
        list: { ul: 'list-disc pl-5', ol: 'list-decimal pl-5' },
        quote: 'border-l-2 pl-3 text-muted-foreground',
      },
      $initialEditorState: () => {
        $convertFromMarkdownString(source, richTransformers, undefined, true)
      },
      onError: (error: Error) => {
        useEditor.getState().setError(`富文本编辑失败：${error.message}`)
      },
    }),
  )
  return (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <div className="rounded-lg border border-border bg-background">
        <RichTextToolbar title={title} />
        <ContentEditable
          className={`nodrag nopan nowheel max-h-72 w-full overflow-auto px-2.5 py-2 text-sm leading-relaxed whitespace-pre-wrap outline-none [&_p]:my-1 ${title ? 'min-h-12' : 'min-h-28'}`}
          aria-label={title ? '富文本主题名称' : '富文本备注'}
          aria-multiline
          spellCheck={false}
        />
      </div>
      <RichDraftPlugin topicId={topicId} source={source} title={title} />
    </LexicalExtensionComposer>
  )
}
