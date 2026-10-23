import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSceneImage } from '@renderer/lib/threeTopicImage'
import { threeTopicAssetKey } from '@renderer/lib/threeTopicAssetKey'

class SceneImage {
  static instances: SceneImage[] = []
  crossOrigin = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  assignments: { src: string; crossOrigin: string }[] = []
  constructor() {
    SceneImage.instances.push(this)
  }
  set src(value: string) {
    this.assignments.push({ src: value, crossOrigin: this.crossOrigin })
  }
}
const image = () => {
  const value = SceneImage.instances.at(-1)
  if (!value) throw new Error('Missing controlled image')
  return value
}
afterEach(() => {
  vi.unstubAllGlobals()
  SceneImage.instances = []
})

describe('spatial image resources', () => {
  it('requests native images with CORS before assigning their URL and releases its abort listener', async () => {
    vi.stubGlobal('Image', SceneImage)
    const controller = new AbortController()
    const result = loadSceneImage('http://127.0.0.1/object/image', controller.signal)
    expect(image().assignments).toEqual([
      { src: 'http://127.0.0.1/object/image', crossOrigin: 'anonymous' },
    ])
    image().onload?.()
    expect(await result).toBe(image())
    controller.abort()
    expect(image().assignments).toHaveLength(1)
    expect(image().onload).toBeNull()
  })

  it('clears failed and cancelled image callbacks without retaining an active URL', async () => {
    vi.stubGlobal('Image', SceneImage)
    const failed = loadSceneImage('data:image/png;base64,bad', new AbortController().signal)
    image().onerror?.()
    expect(await failed).toBeNull()
    expect(image().onerror).toBeNull()
    const controller = new AbortController()
    const cancelled = loadSceneImage('http://127.0.0.1/object/image', controller.signal)
    controller.abort()
    expect(await cancelled).toBeNull()
    expect(image().assignments.at(-1)?.src).toBe('')
    expect(image().onload).toBeNull()
  })

  it('invalidates replaced image content without serializing inline media into raster keys', () => {
    const first = { id: 'image', name: 'Image', mimeType: 'image/png', data: 'original' }
    const key = threeTopicAssetKey(first)
    expect(threeTopicAssetKey(first)).toBe(key)
    expect(key).not.toContain(first.data)
    expect(threeTopicAssetKey({ ...first, data: 'replacement' })).not.toBe(key)
    const stored = {
      id: 'image',
      name: 'Image',
      mimeType: 'image/png',
      storage: { objectId: 'hash-a', byteLength: 20 },
    }
    expect(threeTopicAssetKey(structuredClone(stored))).toBe(threeTopicAssetKey(stored))
    expect(
      threeTopicAssetKey({ ...stored, storage: { ...stored.storage, objectId: 'hash-b' } }),
    ).not.toBe(threeTopicAssetKey(stored))
  })
})
