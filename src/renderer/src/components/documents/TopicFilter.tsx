import { Popover } from 'radix-ui'
import { Filter } from 'lucide-react'
import { useEditor } from '../../state/editor'
import { revealSearchMatch } from '../../state/search'
import { useSpatialView } from '../../state/spatial'
import { markerOptions } from '../metadata/markers'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { FieldSelect } from '../FieldSelect'
import { defaultTopicFilters, filterTopics, useTopicFilters } from './filterTopics'

const ALL = `trelyx:any:${'0'.repeat(65)}`

export function TopicFilter() {
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
          主题筛选
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={12}
          className="z-50 max-h-[75vh] w-80 space-y-3 overflow-auto rounded-xl border bg-popover p-3 shadow-lg"
          aria-label="主题筛选"
        >
          <p className="text-sm font-medium">主题筛选</p>
          <p className="text-xs text-muted-foreground">按标签、图标或任务定位当前画布中的主题。</p>
          <FieldSelect
            label="筛选标签"
            value={filters.label || ALL}
            options={[
              { value: ALL, label: '全部标签' },
              ...labels.map((label) => ({ value: label, label })),
            ]}
            onChange={(value) => {
              useTopicFilters.setState({ label: value === ALL ? '' : value })
            }}
          />
          <FieldSelect
            label="筛选图标"
            value={filters.marker || ALL}
            options={[
              { value: ALL, label: '全部图标' },
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
            label="筛选任务状态"
            value={filters.task}
            options={[
              { value: 'all', label: '全部主题' },
              { value: 'open', label: '未完成任务' },
              { value: 'done', label: '已完成任务' },
              { value: 'overdue', label: '已逾期任务' },
            ]}
            onChange={(task) => {
              useTopicFilters.setState({ task })
            }}
          />
          <FieldSelect
            label="筛选优先级"
            value={filters.priority}
            options={[
              { value: 'all', label: '全部优先级' },
              { value: '1', label: '高优先级' },
              { value: '2', label: '中优先级' },
              { value: '3', label: '低优先级' },
            ]}
            onChange={(priority) => {
              useTopicFilters.setState({ priority })
            }}
          />
          <Input
            aria-label="筛选负责人"
            placeholder="负责人"
            value={filters.assignee}
            onChange={(event) => {
              useTopicFilters.setState({ assignee: event.target.value })
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground" role="status">
              {results.length} 个匹配主题
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                useTopicFilters.setState(defaultTopicFilters)
              }}
            >
              清空筛选
            </Button>
          </div>
          <div className="max-h-56 space-y-1 overflow-auto" aria-label="筛选结果">
            {results.map((topic) => (
              <Button
                key={topic.id}
                variant="ghost"
                className="h-auto w-full justify-start truncate px-2 py-2 text-xs"
                aria-label={`筛选结果：${topic.title}`}
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
