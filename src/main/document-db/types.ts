import type { DocumentAsset } from '@core/types'

export interface NativeReadOptions {
  readonly password?: string
}
export interface NativeObjectSource {
  readonly readObject: (objectId: string) => AsyncIterable<Uint8Array>
}
export interface NativeResourcePackage {
  readonly objectId: string
  readonly byteLength: number
  readonly read: () => AsyncIterable<Uint8Array>
  readonly preview?: {
    readonly objectId: string
    readonly mimeType: string
    readonly width: number
    readonly height: number
  }
  readonly tiles?: readonly {
    readonly level: number
    readonly x: number
    readonly y: number
    readonly objectId: string
  }[]
}
export interface NativeWriteOptions extends NativeReadOptions {
  readonly existingPassword?: string | null
  readonly source?: NativeObjectSource
  readonly resources?: readonly NativeResourcePackage[]
}
export interface NativeRangeOptions extends NativeReadOptions {
  readonly offset?: number
  readonly length?: number
}
export interface StoredAssetMetadata {
  readonly objectId: string
  readonly byteLength: number
  readonly width?: number
  readonly height?: number
  readonly preview?: {
    readonly objectId: string
    readonly mimeType: string
    readonly byteLength: number
    readonly width: number
    readonly height: number
  }
  readonly tiles?: {
    readonly tileSize: number
    readonly overlap: number
    readonly maxLevel: number
    readonly width: number
    readonly height: number
    readonly format: 'webp'
    readonly pipelineVersion: 1
  }
}
export const storedMetadata = (asset: DocumentAsset): StoredAssetMetadata | undefined => {
  return 'storage' in asset ? asset.storage : undefined
}
