import { useMessages } from '@renderer/i18n/useMessages'
import { useTopicStyleActions } from '@renderer/hooks/useTopicStyleActions'
import { Button } from '@renderer/components/ui/button'

export const TopicStyleActions = () => {
  const { translate } = useMessages()
  const actions = useTopicStyleActions()
  return (
    <div className="grid gap-1.5 py-3" role="group" aria-label={translate('topicStyleActions')}>
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          size="sm"
          className="h-auto min-h-8 justify-start whitespace-normal text-left text-xs"
          disabled={action.disabled}
          onClick={action.run}
        >
          {action.label}
        </Button>
      ))}
    </div>
  )
}
