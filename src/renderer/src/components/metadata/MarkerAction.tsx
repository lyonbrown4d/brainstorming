import { Smile } from 'lucide-react'
import { useEditor } from '../../state/editor'
import { DockAction } from '../DockAction'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { MarkerPicker } from './MarkerPicker'
import { TaskQuickControls } from './TaskQuickControls'
import { toggleTopicMarker } from './commands'

export function MarkerAction() {
  const topicId = useEditor((state) => state.selectedId)
  const metadata = useEditor((state) => state.history.document.topics[topicId]?.metadata)
  const busy = useEditor((state) => state.busy)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <DockAction
          caption="标记"
          aria-label="图标与任务标记"
          title="图标与任务标记"
          disabled={busy}
        >
          <Smile className="size-4" />
        </DockAction>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={12}
        className="z-50 max-h-[70vh] w-80 space-y-3 overflow-auto rounded-xl"
        aria-label="图标与任务标记"
      >
        <TaskQuickControls topicId={topicId} task={metadata?.task} />
        <MarkerPicker
          selected={metadata?.markers ?? []}
          onToggle={(marker) => {
            toggleTopicMarker(topicId, marker)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
