import { useMessages } from '@renderer/i18n/useMessages'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { FORMAT_TEXT_COMMAND } from 'lexical'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list'
import { Bold, Italic, Code, Strikethrough, List, ListOrdered } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

export const RichTextToolbar = ({ title }: { title: boolean }) => {
  const { translate } = useMessages()

  const [editor] = useLexicalComposerContext()
  return (
    <div
      className="flex flex-wrap gap-0.5 border-b border-border p-1"
      role="toolbar"
      aria-label={title ? translate('titleTextFormatting') : translate('notesFormatting')}
    >
      {(
        [
          { format: 'bold', label: translate('boldText'), Icon: Bold },
          { format: 'italic', label: translate('italicText'), Icon: Italic },
          { format: 'strikethrough', label: translate('strikethroughText'), Icon: Strikethrough },
          { format: 'code', label: translate('inlineCode'), Icon: Code },
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
            aria-label={translate('bulletList')}
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
            aria-label={translate('numberedList')}
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
