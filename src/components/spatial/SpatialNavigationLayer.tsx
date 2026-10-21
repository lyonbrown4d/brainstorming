import { lazy, Suspense, useEffect } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useMessages } from '@renderer/i18n/useMessages'

const Navigation = lazy(() =>
  import('@renderer/components/spatial/SpatialCameraNavigation').then((module) => ({
    default: module.SpatialCameraNavigation,
  })),
)

const Unavailable = ({ onReady }: { onReady: () => void }) => {
  const { translate } = useMessages()
  useEffect(onReady, [onReady])
  return (
    <span
      className="absolute right-3 top-3 z-20 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground"
      role="status"
    >
      {translate('spatialFallback')}
    </span>
  )
}

/** Load the gizmo/controls package only when entering 3D, behind the canvas loading mask. */
export const SpatialNavigationLayer = (props: { disabled: boolean; onReady: () => void }) => (
  <ErrorBoundary fallbackRender={() => <Unavailable onReady={props.onReady} />}>
    <Suspense fallback={null}>
      <Navigation {...props} />
    </Suspense>
  </ErrorBoundary>
)
