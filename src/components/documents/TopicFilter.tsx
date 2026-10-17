import { useMessages } from '@renderer/i18n/useMessages'

import { Popover } from 'radix-ui'
import { Filter } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { revealSearchMatch } from '@renderer/state/search'
import { useSpatialView } from '@renderer/state/spatial'
import { getMarkerOptions } from '@renderer/components/metadata/markers'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { FieldSelect } from '@renderer/components/FieldSelect'
import {
  defaultTopicFilters,
  filterTopics,
  useTopicFilters,
} from '@renderer/components/documents/filterTopics'

const ALL = `brainstorming:any:${'0'.repeat(65)}`

export const TopicFilter = () => {
  const { translate } = useMessages()
  const markerOptions = getMarkerOptions(translate)

  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
  const sheetId = useEditor((state) => state.activeSheetId)
  const filters = useTopicFilters()
  const labels = [
    ...new Set(Object.values(document.topics).flatMap((topic) => topic.metadata?.labels ?? [])),
  ]
  const markers = [
    ...new Set(Object.values(document.topics).flatMap((topic) => topic.metadata?.markers ?? [])),
  ]
  const results = filterTopics(document, filters)
  const filtered =
    filters.label ||
    filters.marker ||
    filters.task !== 'all' ||
    filters.priority !== 'all' ||
    filters.assignee
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm" aria-pressed={Boolean(filtered)}>
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
          <p className="text-sm font-medium">{translate('filterTopics')}</p>
          <p className="text-xs text-muted-foreground">
            {translate('findTopicsOnThisSheetByLabel')}
          </p>
          <FieldSelect
            label={translate('filterLabels')}
            value={filters.label || ALL}
            options={[
              { value: ALL, label: translate('allLabels') },
              ...labels.map((label) => ({ value: label, label })),
            ]}
            onChange={(value) => {
              useTopicFilters.setState({ label: value === ALL ? '' : value })
            }}
          />
          <FieldSelect
            label={translate('filterIcons')}
            value={filters.marker || ALL}
            options={[
              { value: ALL, label: translate('allIcons') },
              ...markers.map((value) => ({
                value,
                label: markerOptions.find((option) => option.value === value)?.title ?? value,
              })),
            ]}
            onChange={(value) => {
              useTopicFilters.setState({ marker: value === ALL ? '' : value })
            }}
          />
          <FieldSelect
            label={translate('filterTaskStatus')}
            value={filters.task}
            options={[
              { value: 'all', label: translate('allTopics') },
              { value: 'open', label: translate('incompleteTasks') },
              { value: 'done', label: translate('completedTasks') },
              { value: 'overdue', label: translate('overdueTasks') },
            ]}
            onChange={(task) => {
              useTopicFilters.setState({ task })
            }}
          />
          <FieldSelect
            label={translate('filterPriority')}
            value={filters.priority}
            options={[
              { value: 'all', label: translate('allPriorities') },
              { value: '1', label: translate('highPriority') },
              { value: '2', label: translate('mediumPriority') },
              { value: '3', label: translate('lowPriority') },
            ]}
            onChange={(priority) => {
              useTopicFilters.setState({ priority })
            }}
          />
          <Input
            aria-label={translate('filterAssignee')}
            placeholder={translate('assignee')}
            value={filters.assignee}
            onChange={(event) => {
              useTopicFilters.setState({ assignee: event.target.value })
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground" role="status">
              {translate('matchingTopicCount', { count: results.length })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                useTopicFilters.setState(defaultTopicFilters)
              }}
            >
              {translate('clearFilters')}
            </Button>
          </div>
          <div className="max-h-56 space-y-1 overflow-auto" aria-label={translate('filterResults')}>
            {results.map((topic) => (
              <Button
                key={topic.id}
                variant="ghost"
                className="h-auto w-full justify-start truncate px-2 py-2 text-xs"
                aria-label={translate('filterResultValue0', { value0: topic.title })}
                aria-pressed={topic.id === selectedId}
                onClick={() => {
                  revealSearchMatch({
                    sheetId,
                    topicId: topic.id,
                    field: 'title',
                    text: topic.title,
                    count: 1,
                  })
                  if (useSpatialView.getState().sheets[sheetId]?.mode === '3d')
                    useSpatialView
                      .getState()
                      .setFocus(sheetId, topic.id === document.rootId ? null : topic.id)
                }}
              >
                {topic.title}
              </Button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
