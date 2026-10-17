import { useMessages } from '@renderer/i18n/useMessages'

import { Smile } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { DockAction } from '@renderer/components/DockAction'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { MarkerPicker } from '@renderer/components/metadata/MarkerPicker'
import { TaskQuickControls } from '@renderer/components/metadata/TaskQuickControls'
import { setMetadataField, toggleTopicMarker } from '@renderer/components/metadata/commands'
export const MarkerAction = ({ inline = false }: { inline?: boolean }) => {
  const { translate } = useMessages()

  const topicId = useEditor((state) => state.selectedId)
  const metadata = useEditor((state) => state.history.document.topics[topicId]?.metadata)
  const busy = useEditor((state) => state.busy)
  const content = (
    <>
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
    </>
  )
  if (inline)
    return (
      <section
        className="space-y-3 border-t border-border py-4 [&_[data-marker-options]]:grid-cols-2"
        aria-label={translate('iconsAndTaskMarkers')}
      >
        <h3 className="text-sm font-medium">{translate('iconsAndTaskMarkers')}</h3>
        {content}
      </section>
    )
  return (
    <Popover>
      <PopoverTrigger asChild>
        <DockAction
          caption={translate('markers')}
          aria-label={translate('iconsAndTaskMarkers')}
          title={translate('iconsAndTaskMarkers')}
          disabled={busy}
        >
          <Smile className="size-4" />
        </DockAction>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={12}
        className="z-50 max-h-[70vh] w-80 space-y-3 overflow-auto rounded-xl"
        aria-label={translate('iconsAndTaskMarkers')}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
