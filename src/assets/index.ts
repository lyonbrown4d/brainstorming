import { audioMime } from '@assets/audio'
import { base64 } from '@scure/base'
import { imageSize } from 'image-size'
import { validateDocumentAsset, type DocumentAsset } from '@core'

export const MAX_ASSET_BYTES = 8 * 1024 * 1024

export const safeAssetName = (name: string): string => {
  const basename = name.split(/[\\/]/u).at(-1) ?? ''
  const cleaned = basename
    .replace(/[\p{Cc}<>:"|?*]/gu, '_')
    .trim()
    .replace(/[. ]+$/u, '')
  let result = ''
  let length = 0
  const encoder = new TextEncoder()
  for (const character of cleaned) {
    const size = encoder.encode(character).length
    if (length + size > 200) break
    result += character
    length += size
  }
  if (!result || result === '.' || result === '..') return '未命名附件'
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(result) ? `_${result}` : result
}

const rasterMime = (bytes: Uint8Array): string | undefined => {
  const starts = (signature: readonly number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte)
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png'
  if (starts([255, 216, 255])) return 'image/jpeg'
  if (starts([71, 73, 70, 56]) && [55, 57].includes(bytes[4] ?? 0) && bytes[5] === 97)
    return 'image/gif'
  if (
    starts([82, 73, 70, 70]) &&
    bytes[8] === 87 &&
    bytes[9] === 69 &&
    bytes[10] === 66 &&
    bytes[11] === 80
  )
    return 'image/webp'
  return undefined
}

export const createAsset = (
  bytes: Uint8Array,
  name: string,
  id: string = crypto.randomUUID(),
): DocumentAsset => {
  if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error('单个资源不能超过 8 MiB')
  const asset: DocumentAsset = {
    id,
    name: safeAssetName(name),
    mimeType: rasterMime(bytes) ?? audioMime(bytes) ?? 'application/octet-stream',
    data: base64.encode(bytes),
  }
  validateDocumentAsset(asset)
  return asset
}

export const assetBytes = (asset: DocumentAsset): Uint8Array => {
  validateDocumentAsset(asset)
  return base64.decode(asset.data)
}

export const imageDimensions = (asset: DocumentAsset): { width: number; height: number } => {
  const bytes = assetBytes(asset)
  if (!rasterMime(bytes) || rasterMime(bytes) !== asset.mimeType)
    throw new Error('图片仅支持有效的 PNG、JPEG、GIF 或 WebP')
  let dimensions: ReturnType<typeof imageSize>
  try {
    dimensions = imageSize(bytes)
  } catch (cause) {
    throw new Error('无法读取图片，请选择完整的图片文件', { cause })
  }
  const { width, height } = dimensions
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 40_000_000
  )
    throw new Error('图片尺寸超过限制：单边最多 8192 像素，总计最多 4000 万像素')
  return { width, height }
}
