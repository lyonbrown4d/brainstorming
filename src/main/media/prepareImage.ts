import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ImageArtifacts,
  ImageTileFile,
  ImageTileManifest,
  PrepareImageOptions,
} from '@main/media/imageArtifacts'
import { checkImageAbort } from '@main/media/imageArtifacts'
import { inspectImageInput, openImagePipeline } from '@main/media/imageInput'

const gatherTiles = async (
  directory: string,
  manifest: ImageTileManifest,
  signal?: AbortSignal,
): Promise<ImageTileFile[]> => {
  // One bounded tree listing; libvips writes tiles in native code, without JS pixel buffers.
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  checkImageAbort(signal)
  const tiles = entries.flatMap((entry): ImageTileFile[] => {
    if (!entry.isFile()) return []
    const match = /^(\d+)_(\d+)\.webp$/.exec(entry.name)
    if (!match) return []
    const level = Number(entry.parentPath.split(/[\\/]/).at(-1))
    const x = Number(match[1])
    const y = Number(match[2])
    const scale = 2 ** (manifest.maxLevel - level)
    if (
      !Number.isInteger(level) ||
      level < 0 ||
      level > manifest.maxLevel ||
      x >= Math.ceil(Math.ceil(manifest.width / scale) / manifest.tileSize) ||
      y >= Math.ceil(Math.ceil(manifest.height / scale) / manifest.tileSize)
    ) {
      throw new Error('Invalid generated image tile coordinates')
    }
    return [{ level, x, y, path: join(entry.parentPath, entry.name) }]
  })
  const expected = Array.from({ length: manifest.maxLevel + 1 }, (_, level) => {
    const scale = 2 ** (manifest.maxLevel - level)
    return (
      Math.ceil(Math.ceil(manifest.width / scale) / manifest.tileSize) *
      Math.ceil(Math.ceil(manifest.height / scale) / manifest.tileSize)
    )
  }).reduce((sum, count) => sum + count, 0)
  if (tiles.length !== expected) throw new Error('Incomplete image tile pyramid')
  return tiles.sort((a, b) => a.level - b.level || a.y - b.y || a.x - b.x)
}

/**
 * Sharp schedules decoding/resizing on native libuv/libvips workers. Sources remain unchanged.
 * Cancellation is observed between native operations; we await writers before removing outputs.
 * Animated raster inputs use their first frame for derivatives and retain the complete original.
 */
export const prepareImage = async (
  inputPath: string,
  outputDirectory: string,
  { signal }: PrepareImageOptions = {},
): Promise<ImageArtifacts> => {
  checkImageAbort(signal)
  const { original, width, height } = await inspectImageInput(inputPath)
  checkImageAbort(signal)
  await mkdir(outputDirectory, { recursive: true })
  const directory = await mkdtemp(join(outputDirectory, 'image-'))
  try {
    checkImageAbort(signal)
    const previewPath = join(directory, 'preview.webp')
    const previewInfo = await openImagePipeline(inputPath)
      .autoOrient()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toFile(previewPath)
    checkImageAbort(signal)
    const manifest: ImageTileManifest = {
      tileSize: 512,
      overlap: 1,
      maxLevel: Math.ceil(Math.log2(Math.max(width, height))),
      width,
      height,
      format: 'webp',
      pipelineVersion: 1,
    }
    checkImageAbort(signal)
    await openImagePipeline(inputPath)
      .autoOrient()
      .webp({ quality: 88, effort: 4 })
      .tile({
        size: manifest.tileSize,
        overlap: manifest.overlap,
        layout: 'dz',
        container: 'fs',
        depth: 'onepixel',
        skipBlanks: -1,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toFile(join(directory, 'tiles'))
    checkImageAbort(signal)
    const tiles = await gatherTiles(join(directory, 'tiles_files'), manifest, signal)
    return {
      directory,
      original,
      preview: {
        path: previewPath,
        size: previewInfo.size,
        mime: 'image/webp',
        width: previewInfo.width,
        height: previewInfo.height,
      },
      manifest,
      tiles,
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    checkImageAbort(signal)
    throw error
  }
}
