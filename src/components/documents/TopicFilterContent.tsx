import { TASK_PRIORITIES } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'

import { useEditor } from '@renderer/state/editor'
import { revealSearchMatch } from '@renderer/state/search'
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

/** Construct filter choices/results only while Radix mounts the open content. */
export const TopicFilterContent = () => {
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
  return (
    <>
      <p className="text-sm font-medium">{translate('filterTopics')}</p>
      <p className="text-xs text-muted-foreground">{translate('findTopicsOnThisSheetByLabel')}</p>
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
          ...TASK_PRIORITIES.map((priority) => ({
            value: `${priority}` as const,
            label: translate('priorityValue0Label755', { value0: priority }),
          })),
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
            }}
          >
            {topic.title}
          </Button>
        ))}
      </div>
    </>
  )
}
