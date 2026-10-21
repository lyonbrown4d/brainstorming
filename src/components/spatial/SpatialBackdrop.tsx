/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { useMemo, useState } from 'react'
import { Canvas as ThreeCanvas, useThree } from '@react-three/fiber'
import { useViewport } from '@xyflow/react'
import { Matrix4 } from 'three'
import { spatialProjectionSlope } from '@renderer/lib/spatialProjection'
import { SpatialSolid } from '@renderer/components/spatial/SpatialSolid'
import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { SpatialView } from '@renderer/state/spatialView'

const Solids = ({
  nodes,
  depths,
  view,
  x,
  y,
  zoom,
}: {
  nodes: CanvasFlowNode[]
  depths: Readonly<Record<string, number>>
  view: SpatialView
  x: number
  y: number
  zoom: number
}) => {
  const size = useThree((state) => state.size)
  const slope = spatialProjectionSlope(view)
  const shear = useMemo(
    () => new Matrix4().set(1, 0, slope.x, 0, 0, 1, -slope.y, 0, 0, 0, 1, 0, 0, 0, 0, 1),
    [slope.x, slope.y],
  )
  const visible = nodes.filter((node) => {
    const width = node.measured?.width ?? node.initialWidth ?? 100
    const height = node.measured?.height ?? node.initialHeight ?? 50
    const left = node.position.x * zoom + x
    const top = node.position.y * zoom + y
    return (
      node.type === 'topic' &&
      node.data.topic.style?.shape !== 'text' &&
      left + width * zoom > -40 &&
      top + height * zoom > -40 &&
      left < size.width + 40 &&
      top < size.height + 40
    )
  })
  return (
    <group position={[x - size.width / 2, size.height / 2 - y, 0]} scale={[zoom, zoom, zoom]}>
      <group matrix={shear} matrixAutoUpdate={false}>
        {visible.map((node) => {
          if (node.type !== 'topic') return null
          const z = depths[node.id] ?? 0
          return (
            <SpatialSolid
              key={node.id}
              x={node.position.x - z * slope.x}
              y={node.position.y - z * slope.y}
              z={z}
              width={node.measured?.width ?? node.initialWidth ?? 100}
              height={node.measured?.height ?? node.initialHeight ?? 50}
              shape={node.data.topic.style?.shape ?? 'rounded'}
              fill={node.data.fill ?? '#3b3e45'}
              scale={node.data.topic.style?.scale ?? 1}
            />
          )
        })}
      </group>
    </group>
  )
}

const SpatialBackdrop = ({
  nodes,
  depths,
}: {
  nodes: CanvasFlowNode[]
  depths: Readonly<Record<string, number>>
}) => {
  const { view } = useActiveSpatialView()
  const { translate } = useMessages()
  const viewport = useViewport()
  const [lost, setLost] = useState(false)
  const cameraRange = useMemo(
    () => Object.values(depths).reduce((range, z) => Math.max(range, Math.abs(z)), 10000) + 10000,
    [depths],
  )
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
          orthographic
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, cameraRange], near: 0.1, far: cameraRange * 2, zoom: 1 }}
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
          <ambientLight intensity={1.1} />
          <directionalLight position={[500, 600, 1000]} intensity={1.1} />
          <Solids nodes={nodes} depths={depths} view={view} {...viewport} />
        </ThreeCanvas>
      )}
    </div>
  )
}
export default SpatialBackdrop
