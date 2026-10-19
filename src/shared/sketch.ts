import rough from 'roughjs'
import type { SheetVisualStyle, TopicShape } from '@core'
import { topicShapePath } from '@shared/topic-shapes'

const generator = rough.generator()
const outlines = new Map<string, string>()
const MAX_ENTRIES = 1024
const MAX_CHARACTERS = 2 * 1024 * 1024
let characters = 0

/** Stable nonzero Rough.js seed (1..2^31-1); no renderer/session randomness. */
const seedFor = (identity: string): number => {
  let hash = 2166136261
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return ((hash >>> 0) % 2147483646) + 1
}

/** A bounded geometry-only LRU is shared by live SVG and all raster/vector exports. */
export const sketchPath = (path: string, identity: string): string => {
  if (!path) return path
  const key = `${identity}:${path}`
  const cached = outlines.get(key)
  if (cached !== undefined) {
    outlines.delete(key)
    outlines.set(key, cached)
    return cached
  }
  const drawable = generator.path(path, {
    seed: seedFor(identity),
    roughness: 0.8,
    bowing: 0.6,
    maxRandomnessOffset: 1.4,
    preserveVertices: true,
    fixedDecimalPlaceDigits: 2,
  })
  const result = generator
    .toPaths(drawable)
    .map((part) => part.d)
    .join(' ')
  const length = key.length + result.length
  if (length <= MAX_CHARACTERS) {
    while (outlines.size >= MAX_ENTRIES || characters + length > MAX_CHARACTERS) {
      const oldest = outlines.entries().next().value
      if (!oldest) break
      characters -= oldest[0].length + oldest[1].length
      outlines.delete(oldest[0])
    }
    outlines.set(key, result)
    characters += length
  }
  return result
}

export const visualPath = (
  path: string,
  style: SheetVisualStyle | undefined,
  identity: string,
): string => (style === 'sketch' ? sketchPath(path, identity) : path)

export const topicOutlinePath = (shape: TopicShape, width: number, height: number): string =>
  shape === 'ellipse' || shape === 'circle'
    ? `M0 ${height / 2} A${width / 2} ${height / 2} 0 1 0 ${width} ${height / 2} A${width / 2} ${height / 2} 0 1 0 0 ${height / 2} Z`
    : topicShapePath(shape, width, height)
