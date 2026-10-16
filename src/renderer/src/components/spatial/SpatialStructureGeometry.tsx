/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { Line } from '@react-three/drei'
import { memo, useMemo } from 'react'
import { DoubleSide } from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import type { MindMapDocument } from '@core'
import { topicAppearance } from '@shared/appearance'
import type { SpatialDecoration } from '../../../../layout/spatial'

const svgLoader = new SVGLoader()
type Point = [number, number, number]

interface SpatialPathLineProps {
  readonly path: string
  readonly startZ: number
  readonly endZ?: number
  readonly color: string
  readonly lineWidth: number
  readonly opacity: number
  readonly name: string
  readonly kind: string
}

/** Three's SVG parser owns curve sampling; Drei owns line geometry/material disposal. */
function SpatialPathLineComponent({
  path,
  startZ,
  endZ = startZ,
  color,
  lineWidth,
  opacity,
  name,
  kind,
}: SpatialPathLineProps) {
  const paths = useMemo(
    () =>
      svgLoader
        .parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="none"/></svg>`)
        .paths.flatMap((shape) =>
          shape.subPaths.map((part) => {
            const points = part.getPoints(12)
            return points.map((point, index): Point => [
              point.x,
              -point.y,
              startZ + ((endZ - startZ) * index) / Math.max(1, points.length - 1),
            ])
          }),
        ),
    [endZ, path, startZ],
  )
  return paths.map((points, index) =>
    points.length >= 2 ? (
      <Line
        key={index}
        name={name}
        userData={{ structureKind: kind }}
        points={points}
        color={color}
        lineWidth={lineWidth}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    ) : null,
  )
}

export const SpatialPathLine = memo(SpatialPathLineComponent)

export function SpatialStructureGeometry({
  document,
  decorations,
  focusIds,
}: {
  readonly document: MindMapDocument
  readonly decorations: readonly SpatialDecoration[]
  readonly focusIds: ReadonlySet<string> | null
}) {
  return decorations.map((decoration) => {
    const appearance = topicAppearance(document, decoration.topicId)
    const faded = focusIds !== null && !focusIds.has(decoration.topicId)
    if (decoration.kind !== 'cell')
      return (
        <SpatialPathLine
          key={decoration.id}
          name={decoration.id}
          kind={decoration.kind}
          path={decoration.path}
          startZ={decoration.position[2]}
          color={appearance.stroke}
          lineWidth={decoration.kind === 'grid-line' ? 1 : appearance.lineWidth}
          opacity={faded ? 0.12 : decoration.kind === 'grid-line' ? 0.45 : 0.82}
        />
      )
    const [x, y, z] = decoration.position
    const halfWidth = decoration.width / 2
    const halfHeight = decoration.height / 2
    const border: Point[] = [
      [x - halfWidth, y + halfHeight, z + 0.005],
      [x + halfWidth, y + halfHeight, z + 0.005],
      [x + halfWidth, y - halfHeight, z + 0.005],
      [x - halfWidth, y - halfHeight, z + 0.005],
      [x - halfWidth, y + halfHeight, z + 0.005],
    ]
    return (
      <group key={decoration.id} name={decoration.id} userData={{ structureKind: 'cell' }}>
        <mesh position={[x, y, z]}>
          <planeGeometry args={[decoration.width, decoration.height]} />
          <meshBasicMaterial
            color={appearance.stroke}
            transparent
            opacity={faded ? 0.012 : 0.055}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
        <Line
          points={border}
          color={appearance.stroke}
          lineWidth={1}
          transparent
          opacity={faded ? 0.08 : 0.45}
          depthWrite={false}
        />
      </group>
    )
  })
}
