import { Popover } from 'radix-ui'
import { Filter } from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import { TopicFilterContent } from '@renderer/components/documents/TopicFilterContent'
import { useTopicFilters } from '@renderer/components/documents/filterTopics'

export const TopicFilter = () => {
  const { translate } = useMessages()
  const filtered = useTopicFilters(
    (filters) =>
      Boolean(filters.label) ||
      Boolean(filters.marker) ||
      filters.task !== 'all' ||
      filters.priority !== 'all' ||
      Boolean(filters.assignee),
  )
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm" aria-pressed={filtered}>
          <Filter className="size-4" />
          {translate('filterTopics')}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={12}
          className="z-50 max-h-[75vh] w-80 space-y-3 overflow-auto rounded-xl border bg-popover p-3 shadow-lg"
          aria-label={translate('filterTopics')}
        >
          <TopicFilterContent />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
