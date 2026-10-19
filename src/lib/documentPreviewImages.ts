/** Reuse the platform PNG encoder, reducing vector raster size before allocation. */
export const fitPreviewPng = async <T>(
  source: T,
  budget: number,
  signal: AbortSignal,
  rasterize: (source: T, maxDimension: number) => Promise<Uint8Array>,
): Promise<Uint8Array | null> => {
  const finalDimension = Math.min(384, Math.max(1, Math.floor(Math.sqrt(budget / 5))))
  for (const dimension of [1600, 1024, 640, finalDimension]) {
    signal.throwIfAborted()
    const png = await rasterize(source, dimension)
    signal.throwIfAborted()
    if (png.length <= budget) return png
  }
  return null
}
