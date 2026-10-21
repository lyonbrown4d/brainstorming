import { lazy, memo, Suspense, useEffect, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Button } from '@renderer/components/ui/button'
import { useMessages } from '@renderer/i18n/useMessages'
import type { MindMapLayout } from '@layout'

const SpatialBackdrop = lazy(() => import('@renderer/components/spatial/SpatialBackdrop'))

const Fallback = ({ retry, onReady }: { retry: () => void; onReady: () => void }) => {
  const { translate } = useMessages()
  // Keep the shared editor usable if WebGL is unavailable.
  useEffect(onReady, [onReady])
  return (
    <div
      role="status"
      className="absolute bottom-12 left-3 z-30 flex max-w-sm items-center gap-2 rounded-md border bg-background p-2 text-xs"
    >
      <span>{translate('spatialFallback')}</span>
      <Button variant="ghost" size="sm" onClick={retry}>
        {translate('spatialRetry')}
      </Button>
    </div>
  )
}

export const SpatialRenderingLayer = memo(
  (props: { layout: MindMapLayout; onReady: () => void }) => {
    const [started, setStarted] = useState(false)
    useEffect(() => {
      let next = 0
      // Paint the loading mask before creating a WebGL context or compiling shaders.
      const first = requestAnimationFrame(() => {
        next = requestAnimationFrame(() => {
          setStarted(true)
        })
      })
      return () => {
        cancelAnimationFrame(first)
        cancelAnimationFrame(next)
      }
    }, [])
    return (
      <ErrorBoundary
        fallbackRender={({ resetErrorBoundary }) => (
          <Fallback retry={resetErrorBoundary} onReady={props.onReady} />
        )}
      >
        {started && (
          <Suspense fallback={null}>
            <SpatialBackdrop {...props} />
          </Suspense>
        )}
      </ErrorBoundary>
    )
  },
)
SpatialRenderingLayer.displayName = 'SpatialRenderingLayer'
