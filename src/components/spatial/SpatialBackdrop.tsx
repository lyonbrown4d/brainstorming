/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Canvas as ThreeCanvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr } from '@react-three/drei'
import { useViewport, type Viewport } from '@xyflow/react'
import { synchronizeSpatialBackdropCamera } from '@renderer/components/spatial/spatialBackdropCamera'
import { SpatialStage } from '@renderer/components/spatial/SpatialStage'
import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import type { SpatialView } from '@renderer/state/spatialView'
import type { MindMapLayout } from '@layout'

const CameraSync = ({
  view,
  viewport,
  onReady,
}: {
  view: SpatialView
  viewport: Viewport
  onReady: () => void
}) => {
  const { camera, size, invalidate } = useThree()
  const regress = useThree((state) => state.performance.regress)
  const reported = useRef(false)
  const readyFrame = useRef(0)
  useLayoutEffect(() => {
    synchronizeSpatialBackdropCamera(camera, view, viewport, size)
    // Only the reference grid lowers resolution during motion; DOM topics remain crisp.
    regress()
    invalidate()
  }, [camera, size, view, viewport, invalidate, regress])
  useFrame(() => {
    if (reported.current) return
    reported.current = true
    // This runs after the first actual draw has been submitted, before releasing the mask.
    readyFrame.current = requestAnimationFrame(onReady)
  })
  useEffect(
    () => () => {
      cancelAnimationFrame(readyFrame.current)
    },
    [],
  )
  return null
}

const SpatialBackdrop = ({ layout, onReady }: { layout: MindMapLayout; onReady: () => void }) => {
  const { view } = useActiveSpatialView()
  const { translate } = useMessages()
  const viewport = useViewport()
  const [lost, setLost] = useState(false)
  useEffect(() => {
    if (lost) onReady()
  }, [lost, onReady])
  return (
    <div className="pointer-events-none absolute inset-0" data-spatial-renderer>
      {lost ? (
        <div className="pointer-events-auto absolute bottom-12 left-3 z-30 flex items-center gap-2 rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
          {translate('spatialFallback')}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLost(false)
            }}
          >
            {translate('spatialRetry')}
          </Button>
        </div>
      ) : (
        <ThreeCanvas
          key={view.cameraDistance === undefined ? 'orthographic' : 'perspective'}
          orthographic={view.cameraDistance === undefined}
          frameloop="demand"
          dpr={[1, 1.5]}
          performance={{ min: 0.5, debounce: 200 }}
          camera={{ near: 0.1, far: 10000000 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
          fallback={<span className="sr-only">{translate('spatialFallback')}</span>}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              'webglcontextlost',
              (event) => {
                event.preventDefault()
                setLost(true)
              },
              { once: true },
            )
          }}
        >
          <AdaptiveDpr />
          <SpatialStage layout={layout} viewport={viewport} />
          <CameraSync view={view} viewport={viewport} onReady={onReady} />
        </ThreeCanvas>
      )}
    </div>
  )
}
export default SpatialBackdrop
