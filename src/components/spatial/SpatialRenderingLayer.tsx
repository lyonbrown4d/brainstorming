import { lazy, Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Button } from '@renderer/components/ui/button'
import { useMessages } from '@renderer/i18n/useMessages'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'

const SpatialBackdrop = lazy(() => import('@renderer/components/spatial/SpatialBackdrop'))

export const SpatialRenderingLayer = ({
  nodes,
  depths,
}: {
  nodes: CanvasFlowNode[]
  depths: Readonly<Record<string, number>>
}) => {
  const { translate } = useMessages()
  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <div
          role="status"
          className="absolute bottom-12 left-3 z-30 flex max-w-sm items-center gap-2 rounded-md border bg-background p-2 text-xs"
        >
          <span>{translate('spatialFallback')}</span>
          <Button variant="ghost" size="sm" onClick={resetErrorBoundary}>
            {translate('spatialRetry')}
          </Button>
        </div>
      )}
    >
      <Suspense fallback={null}>
        <SpatialBackdrop nodes={nodes} depths={depths} />
      </Suspense>
    </ErrorBoundary>
  )
}
