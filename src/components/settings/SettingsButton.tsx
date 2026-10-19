import { Settings } from 'lucide-react'
import { useInRouterContext, useLocation, useNavigate } from 'react-router'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import { commitWorkspaceNavigation } from '@renderer/routing/workspaceNavigation'
import { WorkspaceRouterBoundary } from '@renderer/routing/WorkspaceRouter'
import { SettingsRoute } from '@renderer/routing/SettingsRoute'

const RoutedSettingsButton = () => {
  const { translate } = useMessages()
  const location = useLocation()
  const navigate = useNavigate()
  const busy = useEditor((state) => state.busy)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      aria-label={translate('applicationSettings')}
      title={translate('applicationSettings')}
      data-settings-trigger
      disabled={busy}
      onClick={() => {
        if (location.pathname !== '/settings' && commitWorkspaceNavigation())
          void navigate('/settings', { state: { settingsReturnTo: location.pathname } })
      }}
    >
      <Settings className="size-4" />
    </Button>
  )
}

export const SettingsButton = () => {
  const withinRouter = useInRouterContext()
  return withinRouter ? (
    <RoutedSettingsButton />
  ) : (
    <WorkspaceRouterBoundary>
      <RoutedSettingsButton />
      <SettingsRoute />
    </WorkspaceRouterBoundary>
  )
}
