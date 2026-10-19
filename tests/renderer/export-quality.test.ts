import { describe, expect, it } from 'vitest'
import { resolveRasterSize } from '@renderer/export/quality'
import { EXPORT_LIMITS } from '@renderer/export/svg'

describe('image export dimensions', () => {
  it('defaults to 2× rather than the former 1× and preserves explicit choices', () => {
    expect(resolveRasterSize({ width: 800, height: 450 })).toEqual({
      width: 1600,
      height: 900,
      scale: 2,
      limited: false,
    })
    expect(resolveRasterSize({ width: 800, height: 450 }, 3)).toEqual({
      width: 2400,
      height: 1350,
      scale: 3,
      limited: false,
    })
  })
  it.each([
    { width: 20_000, height: 12_000 },
    { width: 10_000, height: 10_000 },
    { width: 1_000_000, height: 1 },
    { width: 12.25, height: 16.8 },
  ])('bounds automatic allocations including rounding for $width × $height', (source) => {
    const size = resolveRasterSize(source)
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)
    expect(size.width).toBeLessThanOrEqual(EXPORT_LIMITS.dimension)
    expect(size.height).toBeLessThanOrEqual(EXPORT_LIMITS.dimension)
    expect(size.width * size.height).toBeLessThanOrEqual(EXPORT_LIMITS.pixels)
  })
  it('rejects unsafe explicit allocation instead of silently changing its quality', () => {
    expect(() => resolveRasterSize({ width: 10_000, height: 10_000 }, 2)).toThrow()
    for (const value of [0, NaN, Infinity, -1, 4])
      expect(() => resolveRasterSize({ width: 800, height: 450 }, value)).toThrow()
    expect(() => resolveRasterSize({ width: Infinity, height: 300 })).toThrow()
  })
})
