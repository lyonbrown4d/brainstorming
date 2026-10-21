/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { memo, useEffect, useMemo } from 'react'
import { Color, DoubleSide } from 'three'
import type { TopicShape } from '@core'
import { makeSpatialSolidGeometry } from '@renderer/components/spatial/spatialSolidGeometry'
import { spatialSolidMatrix } from '@renderer/components/spatial/spatialSolidTransform'
import type { SpatialView } from '@renderer/state/spatialView'

export const SpatialSolid = memo(
  ({
    z,
    width,
    height,
    projectedWidth,
    projectedHeight,
    perspectiveScale,
    shape,
    fill,
    scale,
    view,
  }: {
    z: number
    width: number
    height: number
    projectedWidth: number
    projectedHeight: number
    perspectiveScale: number
    shape: TopicShape
    fill: string
    scale: number
    view: SpatialView
  }) => {
    const thickness = 16
    // Canonical dimensions keep the expensive extrusion stable while the camera moves.
    const geometry = useMemo(
      () => makeSpatialSolidGeometry(shape, width / scale, height / scale, thickness),
      [shape, width, height, scale],
    )
    useEffect(
      () => () => {
        geometry.dispose()
      },
      [geometry],
    )
    const matrix = useMemo(
      () =>
        spatialSolidMatrix(view, {
          x: -projectedWidth / (2 * perspectiveScale),
          y: -projectedHeight / (2 * perspectiveScale),
          z,
          scale,
          scaleX: (scale * projectedWidth) / (width * perspectiveScale),
          scaleY: (scale * projectedHeight) / (height * perspectiveScale),
          thickness,
        }),
      [view, projectedWidth, projectedHeight, perspectiveScale, z, scale, width, height],
    )
    const sideFill = useMemo(() => new Color(fill).multiplyScalar(0.82), [fill])
    return (
      <mesh geometry={geometry} matrix={matrix} matrixAutoUpdate={false}>
        <meshStandardMaterial attach="material-0" color={fill} roughness={0.85} side={DoubleSide} />
        <meshStandardMaterial
          attach="material-1"
          color={sideFill}
          roughness={0.8}
          side={DoubleSide}
        />
      </mesh>
    )
  },
)
SpatialSolid.displayName = 'SpatialSolid'
