import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import type { MindMapDocument } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@renderer/components/ui/command'

/** The topic list exists only while its chooser is open, rather than on every canvas selection. */
export const TopicParentPicker = ({
  document,
  topicId,
  parentId,
  onChange,
}: {
  readonly document: MindMapDocument
  readonly topicId: string
  readonly parentId: string
  readonly onChange: (id: string) => void
}) => {
  const { translate } = useMessages()
  const [open, setOpen] = useState(false)
  const forbidden = new Set<string>()
  if (open) {
    const stack = [topicId]
    while (stack.length) {
      const id = stack.pop()
      if (!id || forbidden.has(id)) continue
      forbidden.add(id)
      stack.push(...(document.topics[id]?.children ?? []))
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={translate('moveToParentTopic')}
          className="h-8 w-full justify-between px-2.5 text-xs font-normal"
        >
          <span className="truncate">{document.topics[parentId]?.title}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[80] w-64 p-0">
        {open && (
          <Command>
            <CommandInput
              aria-label={translate('moveToParentTopic')}
              placeholder={translate('moveToParentTopic')}
            />
            <CommandList>
              <CommandEmpty>{translate('noMatchingTopics')}</CommandEmpty>
              {Object.values(document.topics)
                .filter((topic) => !forbidden.has(topic.id))
                .map((topic) => (
                  <CommandItem
                    key={topic.id}
                    value={topic.id}
                    keywords={[topic.title]}
                    onSelect={() => {
                      setOpen(false)
                      onChange(topic.id)
                    }}
                  >
                    <Check
                      className={`size-3.5 ${parentId === topic.id ? 'opacity-100' : 'opacity-0'}`}
                    />
                    <span className="truncate">{topic.title}</span>
                  </CommandItem>
                ))}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
