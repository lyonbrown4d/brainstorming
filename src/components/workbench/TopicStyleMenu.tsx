import { Paintbrush } from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { useTopicStyleActions } from '@renderer/hooks/useTopicStyleActions'
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@renderer/components/ui/context-menu'

export const TopicStyleMenu = ({ run }: { run: (action: () => void) => void }) => {
  const { translate } = useMessages()
  const actions = useTopicStyleActions()
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="gap-2">
        <Paintbrush className="size-4" />
        {translate('topicStyleActions')}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {actions.map((action) => (
          <ContextMenuItem
            key={action.label}
            disabled={action.disabled}
            onSelect={() => {
              run(action.run)
            }}
          >
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
