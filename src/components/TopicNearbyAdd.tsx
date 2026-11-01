import { CornerDownRight, Plus } from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { useTopicDirectControls } from '@renderer/hooks/useTopicDirectControls'
import { Button } from '@renderer/components/ui/button'

export const TopicNearbyAdd = ({ id }: { id: string }) => {
  const { translate } = useMessages()
  const eligible = useTopicDirectControls()
  const root = useEditor((state) => state.history.document.rootId === id)
  return (
    <div
      className="nodrag nopan pointer-events-none flex w-max gap-1 rounded-lg border bg-background p-1 text-foreground shadow-sm"
      data-topic-nearby-add
    >
      {(['child', ...(root ? [] : (['sibling'] as const))] as const).map((kind) => {
        const label = translate(kind === 'child' ? 'addNearbyChild' : 'addNearbySibling')
        const Icon = kind === 'child' ? Plus : CornerDownRight
        return (
          <Button
            key={kind}
            type="button"
            variant="ghost"
            size="icon"
            className="pointer-events-auto size-7"
            aria-label={label}
            title={label}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (eligible === id && useEditor.getState().selectedId === id)
                useEditor.getState().add(kind)
            }}
          >
            <Icon className="size-4" />
          </Button>
        )
      })}
    </div>
  )
}
