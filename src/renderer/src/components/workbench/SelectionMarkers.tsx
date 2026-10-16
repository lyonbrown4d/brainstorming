import { ChevronDown, Smile } from 'lucide-react'
import type { Command } from '@core'
import { useEditor } from '../../state/editor'
import { selectedTopicIds } from '../../state/selection'
import { MarkerPicker } from '../metadata/MarkerPicker'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

function toggleSelectedMarker(marker: string): void {
  const state = useEditor.getState()
  if (state.busy || marker.length > 64) return
  state.commitDraft()
  const current = useEditor.getState()
  if (current.editingId) return
  const topics = selectedTopicIds(current).flatMap((id) => {
    const topic = current.history.document.topics[id]
    return topic ? [topic] : []
  })
  const remove = topics.every((topic) => topic.metadata?.markers?.includes(marker))
  if (
    !remove &&
    topics.some(
      (topic) =>
        (topic.metadata?.markers?.length ?? 0) >= 32 && !topic.metadata?.markers?.includes(marker),
    )
  )
    return
  const commands: Command[] = topics.map((topic) => {
    const markers = topic.metadata?.markers ?? []
    return {
      type: 'setTopicMetadata',
      topicId: topic.id,
      metadata: {
        ...topic.metadata,
        markers: remove
          ? markers.filter((value) => value !== marker)
          : [...new Set([...markers, marker])],
      },
    }
  })
  if (commands.length) current.command({ type: 'batch', commands })
}

export function SelectionMarkers({ ids }: { ids: readonly string[] }) {
  const document = useEditor((state) => state.history.document)
  const busy = useEditor((state) => state.busy)
  const first = document.topics[ids[0] ?? '']?.metadata?.markers ?? []
  const shared = first.filter((marker) =>
    ids.every((id) => document.topics[id]?.metadata?.markers?.includes(marker)),
  )
  return (
    <section className="space-y-3 border-t border-border py-4" aria-label="主题标记">
      <h3 className="text-sm font-medium">标记</h3>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-start gap-2 text-sm font-normal"
            disabled={busy}
          >
            <Smile className="size-4 text-muted-foreground" />
            {shared.length ? `${shared.length} 个共同标记` : '添加标记'}
            <ChevronDown className="ml-auto size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-80" aria-label="所选主题标记">
          {ids.length > 1 && (
            <p className="mb-3 text-xs text-muted-foreground">
              图标应用到全部 {ids.length} 个主题；再次点击共同图标可移除。
            </p>
          )}
          <MarkerPicker selected={shared} onToggle={toggleSelectedMarker} />
        </PopoverContent>
      </Popover>
    </section>
  )
}
