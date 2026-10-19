import { translate } from '@renderer/i18n'
import { checkRasterSize, EXPORT_LIMITS, type SheetSvg } from '@renderer/export/svg'

export interface RasterSize {
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly limited: boolean
}

/** Auto starts at 2× and fits the existing allocation limits before creating a canvas. */
export const resolveRasterSize = (
  source: Pick<SheetSvg, 'width' | 'height'>,
  requested?: number,
): RasterSize => {
  if (![source.width, source.height].every((value) => Number.isFinite(value) && value > 0))
    throw new Error(translate('exportInvalidSize'))
  if (requested !== undefined && (!Number.isFinite(requested) || requested < 0.25 || requested > 3))
    throw new Error(translate('imageScaleMustBeBetween025And'))
  const scale =
    requested ??
    Math.min(
      2,
      (EXPORT_LIMITS.dimension - 1) / source.width,
      (EXPORT_LIMITS.dimension - 1) / source.height,
      Math.sqrt(
        (EXPORT_LIMITS.pixels - EXPORT_LIMITS.dimension * 2) / (source.width * source.height),
      ),
    )
  const width = Math.ceil(source.width * scale)
  const height = Math.ceil(source.height * scale)
  checkRasterSize(width, height)
  return { width, height, scale, limited: requested === undefined && scale < 2 }
}
