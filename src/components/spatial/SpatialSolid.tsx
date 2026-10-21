/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { memo, useEffect, useMemo } from 'react'
import { ExtrudeGeometry, Shape } from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import type { TopicShape } from '@core'
import { topicShapePath } from '@shared/topic-shapes'

const makeGeometry = (shape: TopicShape, width: number, height: number, depth: number) => {
  let shapes: Shape[]
  if (shape === 'ellipse' || shape === 'circle') {
    const ellipse = new Shape()
    ellipse.absellipse(width / 2, height / 2, width / 2, height / 2, 0, Math.PI * 2, false, 0)
    shapes = [ellipse]
  } else {
    const source = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${topicShapePath(shape, width, height)}"/></svg>`
    shapes = new SVGLoader().parse(source).paths.flatMap((path) => path.toShapes())
  }
  const geometry = new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: false,
    curveSegments: 10,
    steps: 1,
  })
  return geometry
}

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
  }: {
    x: number
    y: number
    z: number
    width: number
    height: number
    shape: TopicShape
    fill: string
    scale: number
  }) => {
    const thickness = 9
    const geometry = useMemo(
      () => makeGeometry(shape, width / scale, height / scale, thickness),
      [shape, width, height, scale],
    )
    useEffect(
      () => () => {
        geometry.dispose()
      },
      [geometry],
    )
    return (
      <mesh geometry={geometry} position={[x, -y, z - thickness]} scale={[scale, -scale, 1]}>
        <meshStandardMaterial color={fill} roughness={0.85} metalness={0} />
      </mesh>
    )
  },
)
SpatialSolid.displayName = 'SpatialSolid'
