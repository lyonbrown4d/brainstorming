import type { DocumentAsset } from '@core'

const inlineKeys = new WeakMap<DocumentAsset, number>()
let nextInlineKey = 0

/** Native object IDs are content hashes; inline blobs stay out of serialized raster keys. */
export const threeTopicAssetKey = (asset: DocumentAsset | undefined): string => {
  if (!asset) return ''
  if (asset.storage)
    return `${asset.mimeType}:${asset.storage.preview?.objectId ?? asset.storage.objectId}`
  let key = inlineKeys.get(asset)
  if (key === undefined) {
    key = ++nextInlineKey
    inlineKeys.set(asset, key)
  }
  return `inline:${key}`
}
