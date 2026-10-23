import { lazy, Suspense } from 'react'
import { Canvas2D } from '@renderer/components/Canvas2D'
import { useActiveSpatialSetting } from '@renderer/hooks/useActiveSpatialView'
import { CanvasLoading } from '@renderer/components/workbench/CanvasLoading'

const SpatialCanvas = lazy(
  () => import('@renderer/components/spatial/independent/IndependentSpatialCanvas'),
)
export { ZoomControls } from '@renderer/components/ZoomControls'

/** Renderers share document commands and UI; neither renderer drives the other. */
export const Canvas = ({ mode: requestedMode }: { mode?: '2d' | '3d' }) => {
  const { value: observedMode } = useActiveSpatialSetting((view) => view.mode)
  const mode = requestedMode ?? observedMode
  return mode === '3d' ? (
    <Suspense
      fallback={
        <section className="relative flex-1">
          <CanvasLoading
            error={false}
            retry={() => {
              // The lazy renderer chunk supplies its own retry surface once loaded.
            }}
          />
        </section>
      }
    >
      <SpatialCanvas />
    </Suspense>
  ) : (
    <Canvas2D />
  )
}
