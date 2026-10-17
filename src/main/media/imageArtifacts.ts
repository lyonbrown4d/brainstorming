export const MAX_IMAGE_FILE_BYTES = 1024 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 268_402_689

export interface ImageFileArtifact {
  path: string
  size: number
  mime: string
  width: number
  height: number
}

export interface ImageTileManifest {
  tileSize: 512
  overlap: 1
  maxLevel: number
  width: number
  height: number
  format: 'webp'
  pipelineVersion: 1
}

export interface ImageTileFile {
  level: number
  x: number
  y: number
  path: string
}

export interface ImageArtifacts {
  /** Owned temporary child directory. Caller removes it after storing derived files. */
  directory: string
  original: ImageFileArtifact
  preview: ImageFileArtifact
  manifest: ImageTileManifest
  tiles: ImageTileFile[]
}

export interface PrepareImageOptions {
  signal?: AbortSignal
}

export const checkImageAbort = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('Image preparation cancelled', 'AbortError')
}
