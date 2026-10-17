/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import {
  CameraControls,
  AdaptiveDpr,
  GizmoHelper,
  GizmoViewcube,
  Grid,
  CameraControlsImpl,
} from '@react-three/drei'
import type { SpatialLayout } from '@layout/spatial'
import { spatialFramingNodes } from '@layout/spatial-geometry'
import { useSpatialSelectionVisibility } from '@renderer/hooks/useSpatialSelectionVisibility'
import { useSpatialCamera } from '@renderer/hooks/useSpatialCamera'
import { useSpatialGestures } from '@renderer/hooks/useSpatialGestures'
import { useSpatialSelectionDrag } from '@renderer/hooks/useSpatialSelectionDrag'
import { usePresentation } from '@renderer/state/presentation'
import type { SpatialScreenRect } from '@renderer/lib/spatialDrag'
import { documentAppearance, topicAppearance } from '@shared/appearance'
import { documentStructureKey } from '@shared/layout-geometry'
import { useEditor } from '@renderer/state/editor'
import { useSelectedIds } from '@renderer/state/selection'
import { SpatialAnnotations } from '@renderer/components/annotations/SpatialAnnotations'
import { SpatialConnections } from '@renderer/components/spatial/SpatialConnections'
import { SpatialStructureGeometry } from '@renderer/components/spatial/SpatialStructureGeometry'
import { SpatialTopic } from '@renderer/components/spatial/SpatialTopic'
import type {
  SpatialCameraActions,
  SpatialCameraState,
  SpatialCanvasProps,
} from '@renderer/components/spatial/types'

const CUBE_FACES = ['右', '左', '上', '下', '前', '后']
const MOUSE_ACTIONS = {
  left: CameraControlsImpl.ACTION.TRUCK,
  middle: CameraControlsImpl.ACTION.DOLLY,
  right: CameraControlsImpl.ACTION.TRUCK,
  wheel: CameraControlsImpl.ACTION.NONE,
}

interface SpatialSceneProps extends Omit<SpatialCanvasProps, 'cameraState'> {
  readonly layout: SpatialLayout
  readonly labelPortal: RefObject<HTMLDivElement>
  readonly focusIds: ReadonlySet<string> | null
  readonly initialCamera: SpatialCameraState | undefined
  readonly actions: RefObject<SpatialCameraActions | null>
  readonly onZoomChange: (zoom: number) => void
  readonly onContextLost: () => void
  readonly onSelectionBox: (box: SpatialScreenRect | null) => void
}

export const SpatialScene = ({
  document,
  selectedId,
  focusId,
  layout: baseLayout,
  labelPortal,
  focusIds,
  initialCamera,
  actions,
  onSelect,
  onFocus,
  onCollapse,
  onCameraChange,
  onZoomChange,
  onContextLost,
  onSelectionBox,
}: SpatialSceneProps) => {
  const selectedIds = useSelectedIds()
  const controls = useRef<CameraControlsImpl | null>(null)
  const gl = useThree((state) => state.gl)
  const outlineOpen = useEditor((state) => state.outlineOpen)
  const inspectorOpen = useEditor((state) => state.inspectorOpen)
  const surfaceWidth = useThree((state) => state.size.width)
  const editing = useEditor((state) => state.editingSurface === 'spatial')
  const playing = usePresentation((state) => state.playing)
  const interaction = useSpatialSelectionDrag({
    document,
    layout: baseLayout,
    focusIds,
    controls,
    enabled: !editing && !playing,
    onSelectionBox,
  })
  const layout = interaction.layout
  const framedNodes = useMemo(
    () => spatialFramingNodes(baseLayout, focusIds),
    [focusIds, baseLayout],
  )
  const structureKey = `${document.id}:${documentStructureKey(document)}`
  const { report, orient, smoothTime, framing } = useSpatialCamera({
    controls,
    actions,
    nodes: framedNodes,
    structureKey,
    focusId,
    initialCamera,
    onCameraChange,
    onZoomChange,
  })
  useSpatialSelectionVisibility({
    controls,
    nodes: baseLayout.nodes,
    selectedId,
    frameKey: `${structureKey}:${focusId ?? ''}`,
    framing,
    enabled: !playing && !interaction.active,
  })
  useSpatialGestures({
    canvas: gl.domElement,
    controls,
    enabled: !editing && !interaction.active,
    animation: smoothTime > 0,
  })
  const nodesById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  )
  const appearance = documentAppearance(document)
  const colors = useMemo(
    () =>
      new Map(
        layout.nodes.map((node) => [node.branchId, topicAppearance(document, node.id).stroke]),
      ),
    [document, layout.nodes],
  )
  const floor = layout.bounds.min[1] - 1.05
  const shadowExtent = Math.max(8, Math.min(40, layout.bounds.max[0] - layout.bounds.min[0]))
  const extent = Math.hypot(
    ...layout.bounds.max.map((value, index) => value - (layout.bounds.min[index] ?? 0)),
  )
  const detailed = layout.nodes.length <= 250

  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event): void => {
      event.preventDefault()
      onContextLost()
    }
    canvas.addEventListener('webglcontextlost', lost)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
    }
  }, [gl, onContextLost])

  return (
    <>
      <color attach="background" args={[appearance.background]} />
      <ambientLight intensity={1.9} />
      <hemisphereLight args={['#ffffff', '#c4bed7', 1.2]} />
      <directionalLight
        position={[-5, 12, 10]}
        intensity={2.6}
        castShadow={detailed}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={0.1}
        shadow-camera-far={80}
        shadow-bias={-0.001}
        shadow-normalBias={0.035}
        shadow-radius={5}
      />
      <directionalLight position={[8, 3, -5]} intensity={0.65} color="#e4ddff" />
      <mesh position={[0, floor, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[240, 240]} />
        <shadowMaterial transparent opacity={0.08} />
      </mesh>
      <Grid
        position={[0, floor - 0.015, 0]}
        args={[100, 100]}
        cellSize={1}
        sectionSize={5}
        cellThickness={0.45}
        sectionThickness={0.55}
        cellColor="#d9dbea"
        sectionColor="#d9dbea"
        fadeDistance={35}
        fadeStrength={2.4}
        infiniteGrid
      />
      <SpatialStructureGeometry
        document={document}
        decorations={layout.decorations}
        focusIds={focusIds}
      />
      <SpatialConnections
        document={document}
        layout={layout}
        nodesById={nodesById}
        colors={colors}
        focusIds={focusIds}
      />
      <SpatialAnnotations document={document} layout={layout} labelPortal={labelPortal} />
      {layout.nodes.map((node) => {
        const topic = document.topics[node.id]
        if (!topic) return null
        const root = node.id === document.rootId
        return (
          <SpatialTopic
            key={node.id}
            node={node}
            topic={topic}
            labelPortal={labelPortal}
            root={root}
            detailed={detailed}
            selected={
              interaction.boxIds
                ? interaction.boxIds.includes(node.id)
                : selectedIds.length
                  ? selectedIds.includes(node.id)
                  : node.id === selectedId
            }
            dropTarget={interaction.dropTargetId === node.id}
            muted={focusIds !== null && !focusIds.has(node.id)}
            fill={topicAppearance(document, node.id).fill}
            branchColor={topicAppearance(document, node.id).stroke}
            textColor={topicAppearance(document, node.id).color}
            fontFamily={appearance.fontFamily}
            imageAsset={topic.image ? document.assets?.[topic.image.assetId] : undefined}
            onSelect={onSelect}
            onFocus={onFocus}
            onCollapse={onCollapse}
          />
        )
      })}
      <CameraControls
        ref={controls}
        makeDefault
        regress
        enabled={!editing && !interaction.active}
        mouseButtons={MOUSE_ACTIONS}
        minDistance={1.5}
        maxDistance={Math.max(100, extent * 10)}
        minPolarAngle={0.55}
        maxPolarAngle={1.82}
        minAzimuthAngle={-1.12}
        maxAzimuthAngle={1.12}
        smoothTime={smoothTime}
        draggingSmoothTime={smoothTime * 0.7}
        dollySpeed={0.7}
        truckSpeed={1.4}
        onRest={report}
        onSleep={report}
      />
      <AdaptiveDpr />
      {(playing || surfaceWidth - (outlineOpen ? 216 : 0) - (inspectorOpen ? 256 : 0) > 640) && (
        <GizmoHelper
          alignment="bottom-right"
          margin={[62 + (!playing && inspectorOpen ? 256 : 0), 124]}
        >
          <GizmoViewcube
            faces={CUBE_FACES}
            font="500 34px system-ui, sans-serif"
            color="#f3f1fa"
            hoverColor="#e5dfff"
            textColor="#85809a"
            strokeColor="#dedbea"
            opacity={0.9}
            onClick={(event) => {
              event.stopPropagation()
              const direction =
                event.object.position.lengthSq() > 0 ? event.object.position : event.face?.normal
              if (direction) orient(direction)
              return null
            }}
          />
        </GizmoHelper>
      )}
    </>
  )
}
