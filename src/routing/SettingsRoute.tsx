import { lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { canonicalWorkspacePath, validSettingsReturn } from '@renderer/routing/workspacePaths'

const SettingsDialog = lazy(() => import('@renderer/components/settings/SettingsDialog'))

export const SettingsRoute = () => {
  const location = useLocation()
  const navigate = useNavigate()
  if (location.pathname !== '/settings') return null
  const state: unknown = location.state
  const returnTo =
    state && typeof state === 'object' && 'settingsReturnTo' in state
      ? validSettingsReturn(state.settingsReturnTo)
      : undefined
  const close = (): void => {
    // Only our own Settings button creates this history entry; direct URLs replace safely.
    if (returnTo) void navigate(-1)
    else void navigate(canonicalWorkspacePath(), { replace: true })
  }
  return (
    <Suspense fallback={null}>
      <SettingsDialog onClose={close} />
    </Suspense>
  )
}
