import type { MindMapWorkbook } from '@core'
import { exportSheets } from '@formats/interchange'
import { prepareMarkerIcons } from '@shared/markerIcons'
import { translate } from '@renderer/i18n'
import { prepareExportResources } from '@renderer/export/resources'
import { checkRasterSize, renderSheetSvg, type SheetSvg } from '@renderer/export/svg'
import { resolveRasterSize } from '@renderer/export/quality'

export const prepareSheetImage = async (
  workbook: MindMapWorkbook,
  sheetId: string,
  includeCollapsed = false,
  signal?: AbortSignal,
): Promise<SheetSvg> => {
  signal?.throwIfAborted()
  const selected = exportSheets(workbook, sheetId)
  const prepared = await prepareExportResources(selected, false, signal)
  const sheet = prepared.sheets.find((item) => item.id === sheetId)
  if (!sheet) throw new Error(translate('sheetToExportDoesNotExist'))
  await document.fonts.ready
  await prepareMarkerIcons(sheet.document)
  signal?.throwIfAborted()
  return renderSheetSvg(sheet.document, includeCollapsed)
}

export const rasterizeSheet = async (
  source: SheetSvg,
  scale: number,
): Promise<HTMLCanvasElement> => {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(translate('exportInvalidSize'))
  const width = Math.ceil(source.width * scale)
  const height = Math.ceil(source.height * scale)
  checkRasterSize(width, height)
  await document.fonts.ready
  const url = URL.createObjectURL(new Blob([source.svg], { type: 'image/svg+xml;charset=utf-8' }))
  const canvas = document.createElement('canvas')
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error(translate('couldNotCreateAnImageCanvas'))
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, width, height)
    return canvas
  } catch (error) {
    canvas.width = 0
    canvas.height = 0
    throw error
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const canvasPng = async (canvas: HTMLCanvasElement): Promise<Uint8Array> => {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error(translate('pngEncodingFailed')))
    }, 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}

const pngAtScale = async (source: SheetSvg, scale: number): Promise<Uint8Array> => {
  const canvas = await rasterizeSheet(source, scale)
  try {
    return await canvasPng(canvas)
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

export const renderSheetPng = async (source: SheetSvg, scale?: number): Promise<Uint8Array> =>
  pngAtScale(source, resolveRasterSize(source, scale).scale)

/** Previews scale the vector scene before allocation, never rasterizing a full-sized export first. */
export const boundedRasterPng = async (
  source: SheetSvg,
  maxDimension = 1600,
): Promise<Uint8Array> => {
  if (!Number.isFinite(maxDimension) || maxDimension < 1 || maxDimension > 4096)
    throw new Error(translate('exportInvalidSize'))
  return pngAtScale(source, Math.min(1, maxDimension / source.width, maxDimension / source.height))
}
