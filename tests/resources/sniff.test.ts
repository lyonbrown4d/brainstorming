import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { imageDimensions } from '@assets'
import { applyCommand, createDocument } from '@core'
import { NativeDocuments } from '@main/document-db'
import { ResourceLibrary } from '@main/resources/library'
import { sniffMedia } from '@main/resources/sniff'

describe('resource media detection', () => {
  it('imports a real AVIF as a topic image with stored derivatives instead of classifying it as MP4', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'resource-avif-'))
    const documents = new NativeDocuments()
    const library = new ResourceLibrary(directory, documents)
    try {
      const input = join(directory, 'disguised.png')
      await sharp({ create: { width: 16, height: 12, channels: 3, background: '#c5a5ed' } })
        .avif()
        .toFile(input)
      const bytes = await readFile(input)
      expect(sniffMedia(bytes.subarray(0, 4096))).toBe('image/avif')
      const asset = await library.importFile(input, 'image')
      expect(asset.mimeType).toBe('image/avif')
      expect(asset.storage?.preview?.mimeType).toBe('image/webp')
      expect(asset.storage?.tiles?.format).toBe('webp')
      const dimensions = imageDimensions(asset)
      expect(dimensions).toEqual({ width: 16, height: 12 })
      const document = applyCommand(createDocument(), {
        type: 'setTopicImage',
        topicId: 'root',
        asset,
        ...dimensions,
      })
      expect(document.topics.root?.image?.assetId).toBe(asset.id)
    } finally {
      await library.dispose()
      await documents.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps explicitly selected WebM audio usable without changing generic video classification', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'resource-webm-'))
    const documents = new NativeDocuments()
    const library = new ResourceLibrary(directory, documents)
    try {
      const input = join(directory, 'recording.webm')
      const header = Buffer.from([26, 69, 223, 163, 0, 0, 0, 0])
      const { writeFile } = await import('node:fs/promises')
      await writeFile(input, header)
      expect(sniffMedia(header)).toBe('video/webm')
      const asset = await library.importFile(input, 'audio')
      expect(asset.mimeType).toBe('audio/webm')
      expect(asset.storage?.byteLength).toBe(header.length)
    } finally {
      await library.dispose()
      await documents.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('retains generic MP4 container detection when the signature is not an image', () => {
    const header = Buffer.from('000000186674797069736f6d0000000069736f6d6d703432', 'hex')
    expect(sniffMedia(header)).toBe('video/mp4')
  })
})
