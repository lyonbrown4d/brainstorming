import { lazy, Suspense, useEffect } from 'react'
import { useSettingsRequest } from '@renderer/state/settingsMenu'
import { useLocation, useNavigate } from 'react-router'
import { canonicalWorkspacePath, validSettingsReturn } from '@renderer/routing/workspacePaths'

const SettingsDialog = lazy(() => import('@renderer/components/settings/SettingsDialog'))

export const SettingsRoute = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const requestedSection = useSettingsRequest((state) => state.section)
  useEffect(() => {
    if (!requestedSection) return
    void navigate('/settings', {
      state: {
        settingsReturnTo:
          location.pathname === '/settings' ? canonicalWorkspacePath() : location.pathname,
        settingsSection: requestedSection,
      },
    })
    useSettingsRequest.setState({ section: null })
  }, [requestedSection, location.pathname, navigate])
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
      <SettingsDialog
        onClose={close}
        initialSection={
          state &&
          typeof state === 'object' &&
          'settingsSection' in state &&
          state.settingsSection === 'shortcuts'
            ? 'shortcuts'
            : 'general'
        }
      />
    </Suspense>
  )
}
