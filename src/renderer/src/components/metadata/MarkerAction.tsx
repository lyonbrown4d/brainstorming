import { Smile } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { DockAction } from '@renderer/components/DockAction'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { MarkerPicker } from '@renderer/components/metadata/MarkerPicker'
import { TaskQuickControls } from '@renderer/components/metadata/TaskQuickControls'
import { setMetadataField, toggleTopicMarker } from '@renderer/components/metadata/commands'
export const MarkerAction = () => {
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
          style={metadata?.markerStyle}
          onStyleChange={(style) => {
            setMetadataField(topicId, 'markerStyle', style)
          }}
          selected={metadata?.markers ?? []}
          onToggle={(marker) => {
            toggleTopicMarker(topicId, marker)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
