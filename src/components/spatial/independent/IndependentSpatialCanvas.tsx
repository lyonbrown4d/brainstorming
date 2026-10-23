/* eslint react/no-unknown-property: "off" -- R3F uses Three.js JSX properties. */
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { Canvas as ThreeCanvas } from '@react-three/fiber'
import { ErrorBoundary } from 'react-error-boundary'
import { useIndependentSpatialLayout } from '@renderer/hooks/useIndependentSpatialLayout'
import { useAppearanceColors } from '@renderer/hooks/useAppearanceColors'
import { useMessages } from '@renderer/i18n/useMessages'
import {
  createIndependentSpatialRuntime,
  type SpatialSceneModel,
} from '@renderer/lib/independentSpatialRuntime'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { documentAppearance } from '@shared/appearance'
import { CanvasLoading } from '@renderer/components/workbench/CanvasLoading'
import { CanvasOverlay } from '@renderer/components/workbench/CanvasOverlay'
import { FloatingToolbar } from '@renderer/components/FloatingToolbar'
import { DragFeedback } from '@renderer/components/workbench/DragFeedback'
import { SpatialStage } from '@renderer/components/spatial/SpatialStage'
import { stageFloorExtent } from '@renderer/components/spatial/spatialStageGeometry'
import { IndependentSpatialCamera } from '@renderer/components/spatial/independent/IndependentSpatialCamera'
import { SpatialSceneContent } from '@renderer/components/spatial/independent/SpatialSceneContent'
import { IndependentSpatialRelations } from '@renderer/components/spatial/independent/IndependentSpatialRelations'
import { IndependentSpatialAnnotations } from '@renderer/components/spatial/independent/IndependentSpatialAnnotations'
import { IndependentSpatialEditor } from '@renderer/components/spatial/independent/IndependentSpatialEditor'
import { CanvasContextMenuSurface } from '@renderer/components/workbench/CanvasContextMenu'
import { useIndependentSpatialContextMenu } from '@renderer/hooks/useIndependentSpatialContextMenu'
import { IndependentSpatialMinimap } from '@renderer/components/spatial/independent/IndependentSpatialMinimap'
import { IndependentSpatialControls } from '@renderer/components/spatial/independent/IndependentSpatialControls'
import { useIndependentSpatialGestures } from '@renderer/hooks/useIndependentSpatialGestures'
import { registerIndependentSpatialCanvas } from '@renderer/lib/independentSpatialRegistry'
import { IndependentSpatialInk } from '@renderer/components/spatial/independent/IndependentSpatialInk'
import { IndependentSpatialInkResize } from '@renderer/components/spatial/independent/IndependentSpatialInkResize'
import { IndependentSpatialScale } from '@renderer/components/spatial/independent/IndependentSpatialScale'
import { IndependentSpatialSelection } from '@renderer/components/spatial/independent/IndependentSpatialSelection'

const Scene = ({
  model,
  pending,
  layoutError,
  retryLayout,
}: {
  model: SpatialSceneModel
  pending: boolean
  layoutError: boolean
  retryLayout: () => unknown
}) => {
  const { translate } = useMessages()
  const [runtime] = useState(() => createIndependentSpatialRuntime(model))
  const [cameraReady, setCameraReady] = useState(false)
  const [contentReady, setContentReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const playing = usePresentation((state) => state.playing)
  const ready = cameraReady && contentReady && !failed && !pending
  const contextMenu = useIndependentSpatialContextMenu(runtime)
  const gestures = useIndependentSpatialGestures(runtime, ready && !playing)
  const cameraFinished = useCallback(() => {
    setCameraReady(true)
  }, [])
  const contentFinished = useCallback(() => {
    setContentReady(true)
  }, [])
  const contentPreparing = useCallback(() => {
    setContentReady(false)
  }, [])
  useLayoutEffect(() => {
    runtime.updateModel(model)
  }, [runtime, model])
  const extent = useMemo(() => stageFloorExtent(model.layout, 0), [model.layout])
  return (
    <CanvasContextMenuSurface interaction={contextMenu}>
      <section
        id="sheet-panel"
        role="tabpanel"
        tabIndex={-1}
        aria-label={translate('currentSheet')}
        data-view-mode="3d"
        data-spatial-independent
        className="canvas relative min-w-0 flex-1 touch-none overflow-hidden [container-name:mindmap] [container-type:inline-size]"
        style={{ background: documentAppearance(model.document, model.surface).background }}
      >
        <ErrorBoundary
          key={attempt}
          onError={() => {
            setFailed(true)
          }}
          fallbackRender={() => null}
        >
          <ThreeCanvas
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ fov: 42, near: 0.1, far: 10_000_000 }}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
              stencil: false,
            }}
            onCreated={({ gl, camera, invalidate }) => {
              if (camera.type !== 'PerspectiveCamera')
                throw new Error('Expected perspective camera')
              runtime.attachRenderer(gl.domElement, invalidate)
              gl.domElement.dataset.spatialCanvas = 'three'
              registerIndependentSpatialCanvas(runtime, gl)
              gl.domElement.addEventListener(
                'webglcontextlost',
                (event) => {
                  event.preventDefault()
                  setFailed(true)
                },
                { once: true },
              )
            }}
          >
            <SpatialStage layout={model.layout} extent={extent} />
            <IndependentSpatialCamera
              runtime={runtime}
              disabled={!ready || playing}
              onReady={cameraFinished}
            />
            <SpatialSceneContent
              runtime={runtime}
              onPreparing={contentPreparing}
              onReady={contentFinished}
              onError={() => {
                setFailed(true)
              }}
            />
          </ThreeCanvas>
        </ErrorBoundary>
        {ready && (
          <>
            <IndependentSpatialRelations runtime={runtime} />
            <IndependentSpatialAnnotations runtime={runtime} model={model} />
            <IndependentSpatialEditor runtime={runtime} model={model} />
          </>
        )}
        <IndependentSpatialSelection {...gestures} />
        <IndependentSpatialInk runtime={runtime} ready={ready && !playing} />
        <IndependentSpatialScale runtime={runtime} ready={ready && !playing} />
        <IndependentSpatialInkResize runtime={runtime} ready={ready && !playing} />
        <IndependentSpatialControls runtime={runtime} disabled={!ready} />
        <IndependentSpatialMinimap runtime={runtime} disabled={!ready || playing} />
        {!ready && (
          <CanvasLoading
            error={failed || layoutError}
            retry={() => {
              if (layoutError) return retryLayout()
              setFailed(false)
              setCameraReady(false)
              setContentReady(false)
              setAttempt((value) => value + 1)
            }}
          />
        )}
        {!playing && (
          <CanvasOverlay>
            <DragFeedback />
            <FloatingToolbar />
          </CanvasOverlay>
        )}
      </section>
    </CanvasContextMenuSurface>
  )
}

const IndependentSpatialCanvas = () => {
  const colors = useAppearanceColors()
  const query = useIndependentSpatialLayout()
  const workbookId = useEditor((state) => state.workbook.id)
  const current = useMemo(
    () =>
      query.data
        ? {
            document: query.document,
            layout: query.data.layout,
            depths: query.data.depths,
            surface: colors.canvas,
          }
        : null,
    [query.data, query.document, colors.canvas],
  )
  const [previous, setPrevious] = useState<SpatialSceneModel | null>(current)
  if (current && current !== previous) setPrevious(current)
  const model = current ?? (previous?.document.id === query.document.id ? previous : null)
  return model ? (
    <Scene
      key={`${workbookId}:${query.sheetId}`}
      model={model}
      pending={!current}
      layoutError={!current && Boolean(query.error)}
      retryLayout={() => query.refetch()}
    />
  ) : (
    <section className="relative min-w-0 flex-1" data-view-mode="3d">
      <CanvasLoading error={Boolean(query.error)} retry={() => query.refetch()} />
    </section>
  )
}
export default IndependentSpatialCanvas
