/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { memo, useMemo } from 'react'
import { Grid } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Color, DoubleSide } from 'three'
import type { Viewport } from '@xyflow/react'
import type { MindMapLayout } from '@layout'
import { useAppearanceColors } from '@renderer/hooks/useAppearanceColors'
import {
  stageFloorExtent,
  stageFloorHeight,
} from '@renderer/components/spatial/spatialStageGeometry'

const StageGrid = memo(
  ({
    floorY,
    gridExtent,
    groundColor,
    majorColor,
  }: {
    floorY: number
    gridExtent: number
    groundColor: Color
    majorColor: Color
  }) => {
    const gridArgs = useMemo((): [number, number] => [gridExtent, gridExtent], [gridExtent])
    return (
      <Grid
        position={[0, -floorY, 0]}
        args={gridArgs}
        cellSize={80}
        sectionSize={400}
        cellThickness={0.45}
        sectionThickness={0.65}
        cellColor={groundColor}
        sectionColor={majorColor}
        fadeFrom={0}
        fadeDistance={gridExtent * 0.65}
        fadeStrength={1.6}
        side={DoubleSide}
        renderOrder={-2}
      />
    )
  },
)
StageGrid.displayName = 'StageGrid'

export const SpatialStage = ({
  layout,
  viewport,
}: {
  layout: MindMapLayout
  viewport: Viewport
}) => {
  const colors = useAppearanceColors()
  const { size } = useThree()
  const floorY = useMemo(() => stageFloorHeight(layout), [layout])
  const contentExtent = useMemo(() => stageFloorExtent(layout, 0), [layout])
  const extent = Math.min(
    12000,
    Math.max(contentExtent, (size.width / Math.max(viewport.zoom, 0.01)) * 2),
  )
  // Drei rebuilds planeGeometry whenever its args change, so resize it in bounded steps.
  const gridExtent = Math.min(12000, Math.ceil(extent / 512) * 512)
  const groundColor = useMemo(
    () => new Color(colors.canvas).lerp(new Color(colors.foreground), 0.085),
    [colors.canvas, colors.foreground],
  )
  const majorColor = useMemo(
    () => new Color(colors.canvas).lerp(new Color(colors.foreground), 0.16),
    [colors.canvas, colors.foreground],
  )

  return (
    <StageGrid
      floorY={floorY}
      gridExtent={gridExtent}
      groundColor={groundColor}
      majorColor={majorColor}
    />
  )
}
