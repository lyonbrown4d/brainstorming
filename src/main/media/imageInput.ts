import { open } from 'node:fs/promises'
import { filetypeinfo } from 'magic-bytes.js'
import sharp from 'sharp'
import type { ImageFileArtifact } from '@main/media/imageArtifacts'
import { MAX_IMAGE_FILE_BYTES, MAX_IMAGE_PIXELS } from '@main/media/imageArtifacts'

const formats: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/tiff': 'tiff',
  'image/avif': 'heif',
}

export const openImagePipeline = (path: string) =>
  sharp(path, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning', pages: 1 })

interface InspectedImage {
  original: ImageFileArtifact
  width: number
  height: number
}

export const inspectImageInput = async (path: string): Promise<InspectedImage> => {
  const handle = await open(path, 'r')
  let size: number
  let mime: string | undefined
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size <= 0 || info.size > MAX_IMAGE_FILE_BYTES) {
      throw new Error('Image must be a regular file between 1 byte and 1 GiB')
    }
    size = info.size
    // Header inspection stays bounded even for large originals. Never decode SVG or HTML.
    const header = Buffer.alloc(4096)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    mime = filetypeinfo(header.subarray(0, bytesRead)).find(
      (candidate) => candidate.mime && Object.hasOwn(formats, candidate.mime),
    )?.mime
    if (!mime) throw new Error('Unsupported raster image signature')
  } finally {
    await handle.close()
  }
  const metadata = await openImagePipeline(path).metadata()
  const { width, height } = metadata
  if (
    metadata.format !== formats[mime] ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error('Invalid image dimensions or mismatched image format')
  }
  const orientationSwapsAxes = (metadata.orientation ?? 1) >= 5
  return {
    original: { path, size, mime, width, height },
    width: orientationSwapsAxes ? height : width,
    height: orientationSwapsAxes ? width : height,
  }
}
