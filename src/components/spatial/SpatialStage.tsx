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
    // Camera-plane fading keeps tall layouts from fading the grid away.
    return (
      <Grid
        position={[0, -floorY, 0]}
        args={gridArgs}
        cellSize={80}
        sectionSize={400}
        cellThickness={0.65}
        sectionThickness={1}
        cellColor={groundColor}
        sectionColor={majorColor}
        fadeFrom={1}
        fadeDistance={gridExtent * 0.8}
        fadeStrength={1.35}
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
  const { groundColor, majorColor } = useMemo(() => {
    const canvas = new Color(colors.canvas)
    const foreground = new Color(colors.foreground)
    const luminance = canvas.r * 0.2126 + canvas.g * 0.7152 + canvas.b * 0.0722
    const lightCanvas = luminance > 0.5
    return {
      groundColor: canvas.clone().lerp(foreground, lightCanvas ? 0.28 : 0.085),
      majorColor: canvas.clone().lerp(foreground, lightCanvas ? 0.44 : 0.16),
    }
  }, [colors.canvas, colors.foreground])

  return (
    <StageGrid
      floorY={floorY}
      gridExtent={extent}
      groundColor={groundColor}
      majorColor={majorColor}
    />
  )
}
