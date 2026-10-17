/** Portable resource identities. Paths, session URLs and binary buffers stay outside core. */
export interface AssetPreview {
  readonly objectId: string
  readonly mimeType: string
  readonly byteLength: number
  readonly width: number
  readonly height: number
}
export interface AssetTiles {
  readonly tileSize: number
  readonly overlap: number
  readonly maxLevel: number
  readonly width: number
  readonly height: number
  readonly format: 'webp'
  readonly pipelineVersion: 1
}
export interface AssetStorage {
  readonly objectId: string
  readonly byteLength: number
  readonly width?: number
  readonly height?: number
  readonly preview?: AssetPreview
  readonly tiles?: AssetTiles
}
export const MAX_STORED_ASSET_BYTES = 64 * 1024 ** 3
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
const objectId = (value: unknown): boolean =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
export const validateAssetStorage: (value: unknown) => asserts value is AssetStorage = (
  value: unknown,
): asserts value is AssetStorage => {
  if (
    !record(value) ||
    !objectId(value.objectId) ||
    !integer(value.byteLength, 0, MAX_STORED_ASSET_BYTES)
  )
    throw new Error('资源存储信息无效')
  for (const name of ['width', 'height'] as const)
    if (value[name] !== undefined && !integer(value[name], 1, 65536))
      throw new Error('资源尺寸无效')
  if (value.preview !== undefined) {
    const p = value.preview
    if (
      !record(p) ||
      !objectId(p.objectId) ||
      !integer(p.byteLength, 1, 16 * 1024 ** 2) ||
      !['image/webp', 'image/png', 'image/jpeg'].includes(String(p.mimeType)) ||
      !integer(p.width, 1, 8192) ||
      !integer(p.height, 1, 8192)
    )
      throw new Error('资源预览信息无效')
  }
  if (value.tiles !== undefined) {
    const t = value.tiles
    if (
      !record(t) ||
      !integer(t.tileSize, 128, 2048) ||
      !integer(t.overlap, 0, 16) ||
      !integer(t.width, 1, 65536) ||
      !integer(t.height, 1, 65536) ||
      !integer(t.maxLevel, 0, 16) ||
      t.maxLevel !== Math.ceil(Math.log2(Math.max(t.width, t.height))) ||
      t.format !== 'webp' ||
      t.pipelineVersion !== 1
    )
      throw new Error('图片瓦片信息无效')
  }
}
