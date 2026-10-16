import { describe, expect, it } from 'vitest'
import {
  assetBytes,
  createAsset,
  imageDimensions,
  MAX_ASSET_BYTES,
  safeAssetName,
} from '../src/assets'
import { imageBase64, attachmentBytes } from './fixtures/content'

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
