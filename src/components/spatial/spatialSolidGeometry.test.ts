import { describe, expect, it } from 'vitest'
import { TOPIC_SHAPES } from '@core'
import {
  makeSpatialSolidGeometry,
  spatialSolidShape,
} from '@renderer/components/spatial/spatialSolidGeometry'

describe('spatial solid geometry', () => {
  it.each(TOPIC_SHAPES)('extrudes %s within the requested node bounds', (shape) => {
    const geometry = makeSpatialSolidGeometry(shape, 240, 80, 9)
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox
    expect(bounds).not.toBeNull()
    expect(bounds?.min.x).toBeGreaterThanOrEqual(-0.001)
    expect(bounds?.min.y).toBeGreaterThanOrEqual(-0.001)
    expect(bounds?.max.x).toBeLessThanOrEqual(240.001)
    expect(bounds?.max.y).toBeLessThanOrEqual(80.001)
    expect(bounds?.min.z).toBe(0)
    expect(bounds?.max.z).toBe(9)
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0)
    geometry.dispose()
  })

  it('uses the source outline proportions for a cloud and a size-dependent rounded corner', () => {
    const cloud = spatialSolidShape('cloud', 200, 100)
    expect(cloud.curves).toHaveLength(6)
    expect(cloud.curves[0]?.getPoint(0)).toMatchObject({ x: 36, y: 80 })
    expect(cloud.curves[0]?.getPoint(1)).toMatchObject({ x: 26, y: 36 })

    const short = spatialSolidShape('rounded', 240, 40)
    const tall = spatialSolidShape('rounded', 240, 100)
    expect(short.curves[0]?.getPoint(0).x).toBe(10)
    expect(tall.curves[0]?.getPoint(0).x).toBe(14)
  })

  it('keeps straight silhouettes cheaper than curved ones', () => {
    const rectangle = makeSpatialSolidGeometry('rectangle', 240, 80, 9)
    const rounded = makeSpatialSolidGeometry('rounded', 240, 80, 9)
    expect(rectangle.getAttribute('position').count).toBeLessThan(
      rounded.getAttribute('position').count,
    )
    rectangle.dispose()
    rounded.dispose()
  })
})
