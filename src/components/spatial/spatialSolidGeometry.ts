import { ExtrudeGeometry, Shape } from 'three'
import type { TopicShape } from '@core'

type Point = readonly [number, number]

const polygon = (width: number, height: number, points: readonly Point[]): Shape => {
  const result = new Shape()
  const [firstX, firstY] = points[0] ?? [0, 0]
  result.moveTo((firstX * width) / 100, (firstY * height) / 100)
  for (const [x, y] of points.slice(1)) result.lineTo((x * width) / 100, (y * height) / 100)
  result.closePath()
  return result
}

const cloud = (width: number, height: number): Shape => {
  const result = new Shape()
  const x = (value: number): number => (value * width) / 100
  const y = (value: number): number => (value * height) / 100
  result.moveTo(x(18), y(80))
  result.bezierCurveTo(x(0), y(84), x(0), y(40), x(13), y(36))
  result.bezierCurveTo(x(4), y(6), x(35), y(0), x(46), y(15))
  result.bezierCurveTo(x(64), y(0), x(92), y(3), x(89), y(29))
  result.bezierCurveTo(x(100), y(28), x(100), y(67), x(91), y(72))
  result.bezierCurveTo(x(96), y(100), x(61), y(100), x(50), y(87))
  result.bezierCurveTo(x(38), y(100), x(16), y(100), x(18), y(80))
  result.closePath()
  return result
}

const rounded = (width: number, height: number, radius: number): Shape => {
  const result = new Shape()
  result.moveTo(radius, 0)
  result.lineTo(width - radius, 0)
  result.quadraticCurveTo(width, 0, width, radius)
  result.lineTo(width, height - radius)
  result.quadraticCurveTo(width, height, width - radius, height)
  result.lineTo(radius, height)
  result.quadraticCurveTo(0, height, 0, height - radius)
  result.lineTo(0, radius)
  result.quadraticCurveTo(0, 0, radius, 0)
  result.closePath()
  return result
}

/** Match the shared SVG outline without parsing an SVG document for every visible node. */
export const spatialSolidShape = (shape: TopicShape, width: number, height: number): Shape => {
  switch (shape) {
    case 'ellipse':
    case 'circle': {
      const result = new Shape()
      result.absellipse(width / 2, height / 2, width / 2, height / 2, 0, Math.PI * 2, false, 0)
      return result
    }
    case 'diamond':
      return polygon(width, height, [
        [50, 0],
        [100, 50],
        [50, 100],
        [0, 50],
      ])
    case 'hexagon':
      return polygon(width, height, [
        [16, 0],
        [84, 0],
        [100, 50],
        [84, 100],
        [16, 100],
        [0, 50],
      ])
    case 'tag':
      return polygon(width, height, [
        [0, 0],
        [84, 0],
        [100, 50],
        [84, 100],
        [0, 100],
      ])
    case 'flag':
      return polygon(width, height, [
        [0, 0],
        [100, 0],
        [86, 50],
        [100, 100],
        [0, 100],
      ])
    case 'bookmark':
      return polygon(width, height, [
        [0, 0],
        [100, 0],
        [100, 100],
        [50, 84],
        [0, 100],
      ])
    case 'speech':
      return polygon(width, height, [
        [0, 0],
        [100, 0],
        [100, 82],
        [34, 82],
        [16, 100],
        [20, 82],
        [0, 82],
      ])
    case 'sticky':
      return polygon(width, height, [
        [0, 0],
        [100, 0],
        [100, 84],
        [84, 100],
        [0, 100],
      ])
    case 'cloud':
      return cloud(width, height)
    default: {
      const radius =
        shape === 'rectangle'
          ? 0
          : shape === 'capsule'
            ? Math.min(width, height) / 2
            : Math.min(14, height / 4)
      if (radius === 0)
        return polygon(width, height, [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ])
      return rounded(width, height, radius)
    }
  }
}

export const makeSpatialSolidGeometry = (
  shape: TopicShape,
  width: number,
  height: number,
  depth: number,
): ExtrudeGeometry =>
  new ExtrudeGeometry(spatialSolidShape(shape, width, height), {
    depth,
    bevelEnabled: false,
    curveSegments: shape === 'ellipse' || shape === 'circle' || shape === 'cloud' ? 10 : 6,
    steps: 1,
  })
