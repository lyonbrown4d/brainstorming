import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { watch } from 'node:fs'
import sharp from 'sharp'
import CRC32 from 'crc-32'
import { MAX_IMAGE_FILE_BYTES, prepareImage } from '@main/media'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brainstorming-image-test-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const createImage = async (name: string, width = 1200, height = 769) => {
  const path = join(directory, name)
  await sharp({ create: { width, height, channels: 4, background: '#aabbcc80' } })
    .png()
    .toFile(path)
  return path
}

describe('image preparation', () => {
  it('keeps originals and produces bounded previews and complete overlapped WebP levels', async () => {
    const input = await createImage('original.png', 1800, 769)
    const originalBytes = await readFile(input)
    const result = await prepareImage(input, join(directory, 'derived'))
    expect(await readFile(input)).toEqual(originalBytes)
    expect(result.original).toMatchObject({
      path: input,
      mime: 'image/png',
      width: 1800,
      height: 769,
    })
    expect(result.preview).toMatchObject({ width: 1600, height: 684, mime: 'image/webp' })
    expect((await stat(result.preview.path)).size).toBe(result.preview.size)
    expect(result.manifest).toEqual({
      width: 1800,
      height: 769,
      tileSize: 512,
      overlap: 1,
      maxLevel: 11,
      pipelineVersion: 1,
      format: 'webp',
    })
    const expectedCount = Array.from({ length: 12 }, (_, level) => {
      const scale = 2 ** (11 - level)
      return Math.ceil(1800 / scale / 512) * Math.ceil(769 / scale / 512)
    }).reduce((sum, count) => sum + count, 0)
    expect(result.tiles).toHaveLength(expectedCount)
    const fullSizeTiles = result.tiles.filter((tile) => tile.level === 11)
    expect(fullSizeTiles).toHaveLength(8)
    // Only eight edge/full-sized tiles: bounded parallel metadata reads verify actual libvips output.
    const dimensions = await Promise.all(
      fullSizeTiles.map(async (tile) => {
        const metadata = await sharp(tile.path).metadata()
        const left = tile.x * 512 - (tile.x > 0 ? 1 : 0)
        const top = tile.y * 512 - (tile.y > 0 ? 1 : 0)
        expect(metadata).toMatchObject({
          format: 'webp',
          width: Math.min(1800, (tile.x + 1) * 512 + 1) - left,
          height: Math.min(769, (tile.y + 1) * 512 + 1) - top,
          hasAlpha: true,
        })
        return metadata
      }),
    )
    expect(dimensions).toHaveLength(8)
    const firstTile = fullSizeTiles[0]
    expect(firstTile).toBeDefined()
    const sample = await sharp(firstTile?.path)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer()
    expect(sample[3]).toBe(128)
    const smallest = result.tiles.find((tile) => tile.level === 0)
    expect(smallest).toBeDefined()
    expect(await sharp(smallest?.path).metadata()).toMatchObject({ width: 1, height: 1 })
  })

  it('applies EXIF orientation to derivatives while retaining original dimensions', async () => {
    const input = join(directory, 'oriented.jpg')
    await sharp({ create: { width: 100, height: 60, channels: 3, background: '#ffccaa' } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toFile(input)
    const result = await prepareImage(input, join(directory, 'derived'))
    expect(result.original).toMatchObject({ width: 100, height: 60, mime: 'image/jpeg' })
    expect(result.preview).toMatchObject({ width: 60, height: 100 })
    expect(result.manifest).toMatchObject({ width: 60, height: 100 })
  })

  it('accepts a raster file larger than 100 MiB without loading its original bytes into JS', async () => {
    const input = await createImage('large-original.png', 16, 16)
    await truncate(input, 101 * 1024 * 1024)
    const result = await prepareImage(input, join(directory, 'derived'))
    expect(result.original.size).toBe(101 * 1024 * 1024)
    expect((await stat(input)).size).toBe(result.original.size)
    expect(result.preview.width).toBe(16)
  })

  it.each([
    ['vector.png', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'],
    ['document.jpg', '<html><img src="file:///etc/passwd"></html>'],
    ['broken.png', '\u0089PNG invalid raster'],
  ])(
    'rejects unsupported or damaged raster input %s without derived artifacts',
    async (name, data) => {
      const input = join(directory, name)
      await writeFile(input, data)
      const output = join(directory, 'derived')
      await mkdir(output)
      await expect(prepareImage(input, output)).rejects.toThrow()
      expect(await readdir(output)).toEqual([])
    },
  )

  it('rejects raster dimensions beyond the decoded pixel budget', async () => {
    const input = await createImage('pixel-limit.png', 16, 16)
    const bytes = await readFile(input)
    bytes.writeUInt32BE(65536, 16)
    bytes.writeUInt32BE(65536, 20)
    bytes.writeUInt32BE(CRC32.buf(bytes.subarray(12, 29)) >>> 0, 29)
    await writeFile(input, bytes)
    const output = join(directory, 'derived')
    await mkdir(output)
    await expect(prepareImage(input, output)).rejects.toThrow()
    expect(await readdir(output)).toEqual([])
  })

  it('removes partial derivatives when a signature-valid image fails full decoding', async () => {
    const input = await createImage('truncated.png', 1200, 769)
    const bytes = await readFile(input)
    await writeFile(input, bytes.subarray(0, Math.floor(bytes.length / 2)))
    const output = join(directory, 'derived')
    await mkdir(output)
    await expect(prepareImage(input, output)).rejects.toThrow()
    expect(await readdir(output)).toEqual([])
    expect((await stat(input)).size).toBe(Math.floor(bytes.length / 2))
  })

  it('rejects excessive file size before decoding', async () => {
    const input = await createImage('oversized.png', 16, 16)
    await truncate(input, MAX_IMAGE_FILE_BYTES + 1)
    await expect(prepareImage(input, join(directory, 'derived'))).rejects.toThrow('1 GiB')
    expect((await stat(input)).size).toBe(MAX_IMAGE_FILE_BYTES + 1)
  })

  it('cleans only its own generated directory when cancelled after output creation', async () => {
    const input = await createImage('cancel.png')
    const output = join(directory, 'derived')
    await mkdir(output)
    await writeFile(join(output, 'keep.txt'), 'retained')
    const controller = new AbortController()
    const watcher = watch(output, (_event, filename) => {
      if (filename?.toString().startsWith('image-')) controller.abort()
    })
    try {
      await expect(
        prepareImage(input, output, { signal: controller.signal }),
      ).rejects.toMatchObject({
        name: 'AbortError',
      })
    } finally {
      watcher.close()
    }
    expect(await readdir(output)).toEqual(['keep.txt'])
    expect(await readFile(join(output, 'keep.txt'), 'utf8')).toBe('retained')
    expect((await stat(input)).isFile()).toBe(true)
  })

  it('rejects a pre-cancelled import without touching output', async () => {
    const signal = AbortSignal.abort()
    const output = join(directory, 'derived')
    await expect(prepareImage('missing.png', output, { signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
