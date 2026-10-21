/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { memo, useEffect, useMemo } from 'react'
import { Color, DoubleSide } from 'three'
import type { TopicShape } from '@core'
import { makeSpatialSolidGeometry } from '@renderer/components/spatial/spatialSolidGeometry'
import { spatialSolidMatrix } from '@renderer/components/spatial/spatialSolidTransform'
import { spatialCameraQuaternion } from '@renderer/lib/spatialCamera'
import type { SpatialView } from '@renderer/state/spatialView'

export const SpatialSolid = memo(
  ({
    width,
    height,
    worldWidth,
    worldHeight,
    worldX,
    worldY,
    worldZ,
    shape,
    fill,
    scale,
    orientation,
  }: {
    width: number
    height: number
    worldWidth: number
    worldHeight: number
    worldX: number
    worldY: number
    worldZ: number
    shape: TopicShape
    fill: string
    scale: number
    orientation: SpatialView
  }) => {
    const thickness = 4
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
        spatialSolidMatrix(orientation, {
          x: -worldWidth / 2,
          y: -worldHeight / 2,
          z: 0,
          scale,
          scaleX: (scale * worldWidth) / width,
          scaleY: (scale * worldHeight) / height,
          thickness,
        }),
      [orientation, worldWidth, worldHeight, scale, width, height],
    )
    const rotation = useMemo(() => spatialCameraQuaternion(orientation), [orientation])
    const sideFill = useMemo(() => new Color(fill).multiplyScalar(0.92), [fill])
    return (
      <group position={[worldX, -worldY, worldZ]} quaternion={rotation}>
        <mesh geometry={geometry} matrix={matrix} matrixAutoUpdate={false}>
          {/* Match the editor face; lighting must not create a second gray card behind it. */}
          <meshBasicMaterial attach="material-0" color={fill} side={DoubleSide} />
          <meshStandardMaterial
            attach="material-1"
            color={sideFill}
            roughness={0.8}
            side={DoubleSide}
          />
        </mesh>
      </group>
    )
  },
)
SpatialSolid.displayName = 'SpatialSolid'
