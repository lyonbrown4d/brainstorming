import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { FORMAT_TEXT_COMMAND } from 'lexical'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list'
import { Bold, Italic, Code, Strikethrough, List, ListOrdered } from 'lucide-react'
import { Button } from '../ui/button'

export function RichTextToolbar({ title }: { title: boolean }) {
  const [editor] = useLexicalComposerContext()
  return (
    <div
      className="flex flex-wrap gap-0.5 border-b border-border p-1"
      role="toolbar"
      aria-label={title ? '标题局部格式' : '备注文本格式'}
    >
      {(
        [
          { format: 'bold', label: '粗体文字', Icon: Bold },
          { format: 'italic', label: '斜体文字', Icon: Italic },
          { format: 'strikethrough', label: '删除线文字', Icon: Strikethrough },
          { format: 'code', label: '行内代码', Icon: Code },
        ] as const
      ).map(({ format, label, Icon }) => (
        <Button
          key={format}
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={label}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
          }}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
      {!title && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="无序列表"
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
            }}
          >
            <List className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="有序列表"
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
            }}
          >
            <ListOrdered className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  )
}
