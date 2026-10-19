import { useId } from 'react'
import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import { Button } from '@renderer/components/ui/button'
import { useMessages } from '@renderer/i18n/useMessages'
import { useNotificationSettings } from '@renderer/components/settings/hooks/useNotificationSettings'

export const SettingsNotifications = () => {
  const { translate } = useMessages()
  const { settings, pending, failed, reload, toggle } = useNotificationSettings()
  const descriptionId = useId()
  const status = !settings
    ? 'notificationUnavailable'
    : settings.permission === 'denied'
      ? 'notificationDenied'
      : settings.permission === 'unavailable'
        ? 'notificationUnavailable'
        : settings.permission === 'prompt'
          ? 'notificationPrompt'
          : settings.enabled
            ? 'notificationGranted'
            : 'notificationOff'
  return (
    <div className="space-y-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1 basis-48 space-y-1">
          <p className="text-sm font-medium">{translate('systemNotifications')}</p>
          <p id={descriptionId} className="max-w-72 text-xs leading-5 text-muted-foreground">
            {translate('notificationDescription')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !settings}
          aria-describedby={descriptionId}
          aria-busy={pending}
          onClick={() => {
            void toggle()
          }}
        >
          {pending && <LoadingIndicator className="size-3.5" />}
          {translate(settings?.enabled ? 'notificationDisable' : 'notificationEnable')}
        </Button>
      </div>
      <p role="status" className="text-xs leading-5 text-muted-foreground">
        {translate(pending ? 'notificationLoading' : status)}
      </p>
      {failed && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-xs leading-5 text-destructive">
            {translate('notificationFailed')}
          </p>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              void reload()
            }}
          >
            {translate('notificationRetry')}
          </Button>
        </div>
      )}
    </div>
  )
}
