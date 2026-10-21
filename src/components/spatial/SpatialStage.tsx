/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { useEffect, useMemo } from 'react'
import { Grid } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { DoubleSide, BufferGeometry, Float32BufferAttribute, Color } from 'three'
import type { Viewport } from '@xyflow/react'
import type { MindMapLayout } from '@layout'
import { useAppearanceColors } from '@renderer/hooks/useAppearanceColors'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { SpatialView } from '@renderer/state/spatialView'
import {
  stageDepthSegments,
  stageFloorDepth,
} from '@renderer/components/spatial/spatialStageGeometry'

export const SpatialStage = ({
  layout,
  depths,
  view,
  nodes,
  viewport,
}: {
  layout: MindMapLayout
  depths: Readonly<Record<string, number>>
  view: SpatialView
  nodes: CanvasFlowNode[]
  viewport: Viewport
}) => {
  const colors = useAppearanceColors()
  const { size } = useThree()
  const sectionColor = useMemo(
    () => new Color(colors.foreground).lerp(new Color(colors.canvas), 0.6),
    [colors.foreground, colors.canvas],
  )
  const floorDepth = useMemo(() => stageFloorDepth(layout, depths), [layout, depths])
  const target = view.target ?? { x: 0, y: 0, z: 0 }
  const bases = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout])
  const radius = useMemo(
    () =>
      layout.nodes.reduce(
        (max, node) => Math.max(max, Math.abs(node.x - target.x), Math.abs(node.y - target.y)),
        0,
      ),
    [layout, target.x, target.y],
  )
  const extent = Math.max(2000, radius * 2 + 800, ((size.width + size.height) / viewport.zoom) * 2)
  const positions = useMemo(
    () => stageDepthSegments(layout, depths, nodes, viewport, size, floorDepth, view, bases),
    [layout, depths, nodes, viewport, size, floorDepth, view, bases],
  )
  const geometry = useMemo(() => {
    const next = new BufferGeometry()
    next.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return next
  }, [positions])
  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )
  return (
    <>
      <Grid
        position={[target.x, -target.y, floorDepth]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[extent, extent]}
        cellSize={40}
        sectionSize={200}
        cellThickness={0.6}
        sectionThickness={1.1}
        cellColor={colors.border}
        sectionColor={sectionColor}
        fadeFrom={0}
        fadeDistance={extent + Math.hypot(target.x, target.y, floorDepth) * 4}
        fadeStrength={0.8}
        side={DoubleSide}
        renderOrder={-2}
      />
      {positions.length > 0 && (
        <lineSegments renderOrder={-1}>
          <primitive attach="geometry" object={geometry} />
          <lineBasicMaterial
            color={colors.foreground}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </>
  )
}
