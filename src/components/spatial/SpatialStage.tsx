/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { memo, useMemo } from 'react'
import { Grid } from '@react-three/drei'
import { Color, DoubleSide } from 'three'
import type { MindMapLayout } from '@layout'
import { useAppearanceColors } from '@renderer/hooks/useAppearanceColors'
import { stageFloorHeight } from '@renderer/components/spatial/spatialStageGeometry'

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

export const SpatialStage = ({ layout, extent }: { layout: MindMapLayout; extent: number }) => {
  const colors = useAppearanceColors()
  const floorY = useMemo(() => stageFloorHeight(layout), [layout])
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
      gridExtent={extent}
      groundColor={groundColor}
      majorColor={majorColor}
    />
  )
}
