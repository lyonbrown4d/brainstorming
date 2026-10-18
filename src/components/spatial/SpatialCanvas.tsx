import { useMessages } from '@renderer/i18n/useMessages'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { layoutSpatialDocument, spatialSubtreeIds } from '@layout/spatial'
import { presentationDocument, usePresentation } from '@renderer/state/presentation'
import { CanvasOverlay } from '@renderer/components/workbench/CanvasOverlay'
import { DragFeedback } from '@renderer/components/workbench/DragFeedback'
import { SpatialControls } from '@renderer/components/spatial/SpatialControls'
import { SpatialScene } from '@renderer/components/spatial/SpatialScene'
import type { SpatialCameraActions, SpatialCanvasProps } from '@renderer/components/spatial/types'
import type { SpatialScreenRect } from '@renderer/lib/spatialDrag'

export type { SpatialCameraState, SpatialCanvasProps } from '@renderer/components/spatial/types'

export const SpatialCanvas = ({
  document,
  selectedId,
  focusId,
  cameraState,
  onSelect,
  onFocus,
  onCollapse,
  onCameraChange,
}: SpatialCanvasProps) => {
  const { translate } = useMessages()

  const presentation = usePresentation()
  const presentedId = presentation.playing
    ? presentation.steps[presentation.index]?.topicId
    : undefined
  const layout = useMemo(
    () => layoutSpatialDocument(presentationDocument(document, presentedId)),
    [document, presentedId],
  )
  const extent = Math.hypot(
    ...layout.bounds.max.map((value, index) => value - (layout.bounds.min[index] ?? 0)),
  )
  const focusIds = useMemo(
    () => (focusId ? spatialSubtreeIds(document, focusId) : null),
    [document, focusId],
  )
  const actions = useRef<SpatialCameraActions | null>(null)
  const [labelLayer, setLabelLayer] = useState<HTMLDivElement | null>(null)
  const labelPortal = useMemo(() => (labelLayer ? { current: labelLayer } : null), [labelLayer])
  const [initialCamera] = useState(cameraState)
  const [zoom, setZoom] = useState(100)
  const [selectionBox, setSelectionBox] = useState<SpatialScreenRect | null>(null)
  const [contextLost, setContextLost] = useState(false)
  const handleContextLost = useCallback(() => {
    setContextLost(true)
  }, [])

  if (contextLost) throw new Error(translate('3dGraphicsContextWasLostPleaseReopen'))

  return (
    <section
      className="relative h-full w-full overflow-hidden bg-canvas [container-type:inline-size]"
      aria-label={translate('3dMindMap')}
      data-spatial-surface
    >
      <div
        ref={setLabelLayer}
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      />
      {labelPortal && (
        <Canvas
          frameloop="demand"
          dpr={[1, 1.65]}
          camera={{ position: [3, 4.6, 20], fov: 42, near: 0.1, far: Math.max(500, extent * 20) }}
          shadows={layout.nodes.length <= 250 ? { type: PCFShadowMap } : false}
          gl={{ antialias: true, alpha: false, powerPreference: 'default' }}
          fallback={
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {translate('thisDeviceCannotCreateA3dCanvas')}
            </p>
          }
        >
          <SpatialScene
            document={document}
            selectedId={selectedId}
            focusId={focusId}
            layout={layout}
            labelPortal={labelPortal}
            focusIds={focusIds}
            initialCamera={initialCamera}
            actions={actions}
            onSelect={onSelect}
            onFocus={onFocus}
            onCollapse={onCollapse}
            onCameraChange={onCameraChange}
            onZoomChange={setZoom}
            onContextLost={handleContextLost}
            onSelectionBox={setSelectionBox}
          />
        </Canvas>
      )}
      {selectionBox && (
        <div
          data-spatial-selection
          className="pointer-events-none absolute z-20 border border-primary bg-primary/10"
          style={{
            left: selectionBox.left,
            top: selectionBox.top,
            width: selectionBox.width,
            height: selectionBox.height,
          }}
        />
      )}
      {!presentation.playing && (
        <CanvasOverlay>
          <DragFeedback />
          <SpatialControls actions={actions} focused={focusId !== null} zoom={zoom} />
        </CanvasOverlay>
      )}
    </section>
  )
}

export default SpatialCanvas
