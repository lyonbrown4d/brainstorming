/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas as ThreeCanvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr } from '@react-three/drei'
import { useStore, useStoreApi } from '@xyflow/react'
import { synchronizeSpatialBackdropCamera } from '@renderer/components/spatial/spatialBackdropCamera'
import { SpatialStage } from '@renderer/components/spatial/SpatialStage'
import { useActiveSpatialSetting } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import { getSpatialView, useSpatialView, type SpatialView } from '@renderer/state/spatialView'
import { useSpatialLens, spatialLensKey } from '@renderer/state/spatialLens'
import { useEditor } from '@renderer/state/editor'
import { stageFloorExtent } from '@renderer/components/spatial/spatialStageGeometry'
import type { MindMapLayout } from '@layout'

const CameraSync = ({
  workbookId,
  sheetId,
  flowStore,
  onReady,
}: {
  workbookId: string
  sheetId: string
  flowStore: ReturnType<typeof useStoreApi>
  onReady: () => void
}) => {
  const { camera, size, invalidate } = useThree()
  const regress = useThree((state) => state.performance.regress)
  const reported = useRef(false)
  const readyFrame = useRef(0)
  useLayoutEffect(() => {
    let previousView: SpatialView | undefined
    let previousTransform: readonly number[] | undefined
    const update = (): void => {
      const view = getSpatialView(workbookId, sheetId)
      const transform = flowStore.getState().transform
      if (view === previousView && transform === previousTransform) return
      previousView = view
      previousTransform = transform
      const [x, y, zoom] = transform
      synchronizeSpatialBackdropCamera(camera, view, { x, y, zoom }, size)
      // Mutate the external camera directly, following R3F's transient-update guidance.
      regress()
      invalidate()
    }
    update()
    const stop = [
      useSpatialView.subscribe(update),
      useSpatialLens.subscribe(update),
      useEditor.subscribe(update),
      flowStore.subscribe(update),
    ]
    return () => {
      for (const unsubscribe of stop) unsubscribe()
    }
  }, [camera, size, workbookId, sheetId, flowStore, invalidate, regress])
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
  const { workbookId, sheetId } = useActiveSpatialSetting((view) => view.mode)
  const perspective = useSpatialLens(
    (state) => state.distances[spatialLensKey(workbookId, sheetId)] !== undefined,
  )
  const flowStore = useStoreApi()
  const contentExtent = useMemo(() => stageFloorExtent(layout, 0), [layout])
  const extent = useStore((state) =>
    Math.min(
      12000,
      Math.ceil(
        Math.max(contentExtent, (state.width / Math.max(state.transform[2], 0.01)) * 2) / 512,
      ) * 512,
    ),
  )
  const { translate } = useMessages()
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
          key={perspective ? 'perspective' : 'orthographic'}
          orthographic={!perspective}
          frameloop="demand"
          dpr={[1, 1.5]}
          performance={{ min: 0.5, debounce: 200 }}
          camera={{ near: 0.1, far: 10000000 }}
          gl={{
            antialias: false,
            alpha: true,
            depth: false,
            stencil: false,
            powerPreference: 'high-performance',
          }}
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
          <SpatialStage layout={layout} extent={extent} />
          <CameraSync
            workbookId={workbookId}
            sheetId={sheetId}
            flowStore={flowStore}
            onReady={onReady}
          />
        </ThreeCanvas>
      )}
    </div>
  )
}
export default SpatialBackdrop
