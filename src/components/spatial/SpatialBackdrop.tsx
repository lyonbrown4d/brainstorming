/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas as ThreeCanvas, useFrame, useThree } from '@react-three/fiber'
import { useViewport, type Viewport } from '@xyflow/react'
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import {
  createSpatialCamera,
  projectSpatialPoint,
  spatialCameraQuaternion,
  spatialPerspectiveScale,
  unprojectSpatialPoint,
} from '@renderer/lib/spatialCamera'
import { SpatialStage } from '@renderer/components/spatial/SpatialStage'
import { SpatialSolid } from '@renderer/components/spatial/SpatialSolid'
import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { SpatialView } from '@renderer/state/spatialView'
import type { MindMapLayout } from '@layout'

const Solids = ({
  nodes,
  depths,
  layout,
  view,
  viewport,
  onReady,
}: {
  nodes: CanvasFlowNode[]
  depths: Readonly<Record<string, number>>
  layout: MindMapLayout
  view: SpatialView
  viewport: Viewport
  onReady: () => void
}) => {
  const { camera, size, invalidate } = useThree()
  const reported = useRef(false)
  const readyFrame = useRef(0)
  const bases = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout])
  const rotation = useMemo(() => spatialCameraQuaternion(view), [view])
  const range = useMemo(
    () =>
      layout.nodes.reduce(
        (max, node) =>
          Math.max(max, Math.abs(node.x), Math.abs(node.y), Math.abs(depths[node.id] ?? 0)),
        10000,
      ) *
        4 +
      10000,
    [layout, depths],
  )
  useLayoutEffect(() => {
    const target = view.target ?? { x: 0, y: 0, z: 0 }
    if (camera instanceof PerspectiveCamera && view.cameraDistance !== undefined) {
      const distance = view.cameraDistance
      const next = new PerspectiveCamera(
        42,
        size.width / Math.max(size.height, 1),
        1,
        range + distance * 3,
      )
      const rotation = spatialCameraQuaternion(view)
      next.position
        .set(target.x, -target.y, target.z)
        .add(new Vector3(0, 0, distance).applyQuaternion(rotation))
      next.quaternion.copy(rotation)
      next.setViewOffset(
        size.width,
        size.height,
        size.width / 2 - (target.x * viewport.zoom + viewport.x),
        size.height / 2 - (target.y * viewport.zoom + viewport.y),
        size.width,
        size.height,
      )
      camera.copy(next)
    } else if (camera instanceof OrthographicCamera) {
      const next = createSpatialCamera(view, range)
      const { x, y, zoom } = viewport
      next.left = -x / zoom - target.x
      next.right = (size.width - x) / zoom - target.x
      next.top = y / zoom + target.y
      next.bottom = (y - size.height) / zoom + target.y
      next.updateProjectionMatrix()
      camera.copy(next)
    } else return
    camera.updateMatrixWorld()
    invalidate()
  }, [camera, size, view, viewport, range, invalidate])
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
  return (
    <>
      {nodes.map((node) => {
        if (node.type !== 'topic' || node.data.topic.style?.shape === 'text') return null
        const width = node.measured?.width ?? node.initialWidth ?? 100
        const height = node.measured?.height ?? node.initialHeight ?? 50
        const left = node.position.x * viewport.zoom + viewport.x
        const top = node.position.y * viewport.zoom + viewport.y
        if (
          left + width * viewport.zoom < -40 ||
          top + height * viewport.zoom < -40 ||
          left > size.width + 40 ||
          top > size.height + 40
        )
          return null
        const base = bases.get(node.id)
        if (!base) return null
        const depth = projectSpatialPoint(
          { x: base.x + base.width / 2, y: base.y + base.height / 2, z: depths[node.id] ?? 0 },
          view,
        ).z
        const perspectiveScale = spatialPerspectiveScale(view, depth)
        const center = unprojectSpatialPoint(
          { x: node.position.x + width / 2, y: node.position.y + height / 2, z: depth },
          view,
        )
        return (
          <group key={node.id} position={[center.x, -center.y, center.z]} quaternion={rotation}>
            <SpatialSolid
              z={0}
              width={base.width}
              height={base.height}
              projectedWidth={width}
              projectedHeight={height}
              perspectiveScale={perspectiveScale}
              view={view}
              shape={node.data.topic.style?.shape ?? 'rounded'}
              fill={node.data.fill ?? '#3b3e45'}
              scale={node.data.topic.style?.scale ?? 1}
            />
          </group>
        )
      })}
    </>
  )
}

const SpatialBackdrop = ({
  nodes,
  depths,
  layout,
  onReady,
}: {
  nodes: CanvasFlowNode[]
  depths: Readonly<Record<string, number>>
  layout: MindMapLayout
  onReady: () => void
}) => {
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
          <SpatialStage layout={layout} viewport={viewport} />
          <ambientLight intensity={1.15} />
          <hemisphereLight args={['#ffffff', '#a5a8bb', 0.85]} />
          <directionalLight position={[-500, 900, 1000]} intensity={1.45} />
          <directionalLight position={[700, 200, -450]} intensity={0.35} color="#d9e3ff" />
          <Solids
            nodes={nodes}
            depths={depths}
            layout={layout}
            view={view}
            viewport={viewport}
            onReady={onReady}
          />
        </ThreeCanvas>
      )}
    </div>
  )
}
export default SpatialBackdrop
