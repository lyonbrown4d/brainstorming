/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { memo, useEffect, useMemo } from 'react'
import { Color, DoubleSide } from 'three'
import type { TopicShape } from '@core'
import { makeSpatialSolidGeometry } from '@renderer/components/spatial/spatialSolidGeometry'
import { spatialSolidMatrix } from '@renderer/components/spatial/spatialSolidTransform'
import type { SpatialView } from '@renderer/state/spatialView'

export const SpatialSolid = memo(
  ({
    x,
    y,
    z,
    width,
    height,
    shape,
    fill,
    scale,
    view,
  }: {
    x: number
    y: number
    z: number
    width: number
    height: number
    shape: TopicShape
    fill: string
    scale: number
    view: SpatialView
  }) => {
    const thickness = 22
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
      () => spatialSolidMatrix(view, { x, y, z, scale, thickness }),
      [view, x, y, z, scale],
    )
    const sideFill = useMemo(() => new Color(fill).multiplyScalar(0.64), [fill])
    return (
      <mesh geometry={geometry} matrix={matrix} matrixAutoUpdate={false}>
        <meshStandardMaterial attach="material-0" color={fill} roughness={0.85} side={DoubleSide} />
        <meshStandardMaterial
          attach="material-1"
          color={sideFill}
          roughness={0.95}
          side={DoubleSide}
        />
      </mesh>
    )
  },
)
SpatialSolid.displayName = 'SpatialSolid'
