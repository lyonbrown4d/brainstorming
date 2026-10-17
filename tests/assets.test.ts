import { describe, expect, it } from 'vitest'
import { assetBytes, createAsset, imageDimensions, MAX_ASSET_BYTES, safeAssetName } from '@assets'
import { imageBase64, attachmentBytes } from '@tests/fixtures/content'

describe('embedded asset boundary', () => {
  it('preserves arbitrary attachment bytes and normalizes portable filenames', () => {
    const asset = createAsset(attachmentBytes, '../资料.bin', 'binary')
    expect(asset.name).toBe('资料.bin')
    expect(asset.mimeType).toBe('application/octet-stream')
    expect(assetBytes(asset)).toEqual(attachmentBytes)
    expect(safeAssetName('CON.txt')).toBe('_CON.txt')
    expect(new TextEncoder().encode(safeAssetName('🌱'.repeat(300))).length).toBeLessThanOrEqual(
      200,
    )
  })

  it('detects raster content from bytes and rejects disguised non-raster content as an image', () => {
    const image = createAsset(Buffer.from(imageBase64, 'base64'), 'example.txt', 'image')
    expect(image.mimeType).toBe('image/png')
    expect(imageDimensions(image)).toEqual({ width: 64, height: 32 })
    const svg = createAsset(new TextEncoder().encode('<svg><script/></svg>'), 'fake.png', 'svg')
    expect(svg.mimeType).toBe('application/octet-stream')
    expect(() => imageDimensions(svg)).toThrow('图片仅支持')
    expect(() => imageDimensions({ ...svg, mimeType: 'image/png' })).toThrow()
  })

  it.each([
    ['wav', 'audio/wav', [82, 73, 70, 70, 4, 0, 0, 0, 87, 65, 86, 69]],
    ['mp3', 'audio/mpeg', [73, 68, 51, 4, 0, 0, 0, 0, 0, 0]],
    ['ogg', 'audio/ogg', [79, 103, 103, 83, 0, 0, 0, 0]],
    ['webm', 'audio/webm', [26, 69, 223, 163, 0, 0, 0, 0]],
    ['m4a', 'audio/mp4', [0, 0, 0, 20, 102, 116, 121, 112, 77, 52, 65, 32]],
    ['aac', 'audio/aac', [255, 241, 80, 128]],
    ['flac', 'audio/flac', [102, 76, 97, 67, 0, 0, 0, 34]],
  ] as const)(
    'detects %s audio containers from bytes and normalizes MIME aliases',
    (extension, mime, header) => {
      const bytes = Uint8Array.from(header)
      const asset = createAsset(bytes, `audio.${extension}`, 'audio')
      expect(asset.mimeType).toBe(mime)
      expect(assetBytes(asset)).toEqual(bytes)
      expect(() => imageDimensions(asset)).toThrow('图片仅支持')
    },
  )

  it('does not trust audio filename extensions or admit unsupported media', () => {
    const disguised = createAsset(
      new TextEncoder().encode('<script>bad</script>'),
      'fake.mp3',
      'fake',
    )
    expect(disguised.mimeType).toBe('application/octet-stream')
    const midi = createAsset(Uint8Array.from([77, 84, 104, 100, 0, 0, 0, 6]), 'music.mid', 'midi')
    expect(midi.mimeType).toBe('application/octet-stream')
  })

  it('rejects oversized bytes and malformed base64 before allocation', () => {
    expect(() => createAsset(new Uint8Array(MAX_ASSET_BYTES + 1), 'big.bin')).toThrow('8 MiB')
    expect(() =>
      assetBytes({
        id: 'bad',
        name: 'bad.bin',
        mimeType: 'application/octet-stream',
        data: 'bad==',
      }),
    ).toThrow()
  })
})
