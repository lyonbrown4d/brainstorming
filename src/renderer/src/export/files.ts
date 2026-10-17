import { prepareMarkerIcons } from '@shared/markerIcons'
import type { MindMapWorkbook } from '@core'
import {
  encodeMarkdown,
  encodeOpml,
  encodeText,
  encodeXmind,
  exportSheets,
} from '@formats/interchange'
import { checkRasterSize, renderSheetSvg, type SheetSvg } from '@renderer/export/svg'

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'md' | 'opml' | 'txt' | 'xmind'
export interface ExportRequest {
  format: ExportFormat
  suggestedName: string
  bytes: Uint8Array
}
export interface ExportOptions {
  format: ExportFormat
  sheetId: string
  wholeWorkbook?: boolean
  includeCollapsed?: boolean
  scale?: number
}
const mimeTypes: Record<ExportFormat, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  md: 'text/markdown',
  opml: 'text/xml',
  txt: 'text/plain',
  xmind: 'application/zip',
}
export const exportNotice: Record<ExportFormat, string> = {
  png: '导出当前画布的完整二维导图。图片、标题和内容标记可见，备注正文与附件文件不在图中。',
  svg: '导出完整二维矢量导图，嵌入图片。字体使用查看设备的本地系统字体；备注正文与附件文件不在图中。',
  pdf: '导出单页 PDF，按完整二维导图适配 A3 页面；中文以图片保留，文字不可搜索。',
  md: '保留全部主题层级与标题。Markdown 不保留样式、折叠、备注、图片、附件及其他注释内容。',
  opml: '保留画布、主题层级、标题和纯文本备注。OPML 不保留样式、折叠、图片、附件及其他注释内容。',
  txt: '保留画布名称、缩进层级和标题；标题内换行写作 \\n。纯文本不保留其他内容。',
  xmind:
    '现代 XMind 文件包含所选画布、主题、备注和内嵌资源。每个主题的首个附件使用标准链接；额外附件和扩展元数据写入 Trelyx 扩展，其他软件可能忽略。仅导出当前画布时会移除指向其他画布的主题链接。',
}
const rasterize = async (source: SheetSvg, scale: number): Promise<HTMLCanvasElement> => {
  if (!Number.isFinite(scale) || scale < 0.25 || scale > 3)
    throw new Error('图片倍率须为 0.25 至 3')
  const width = Math.ceil(source.width * scale)
  const height = Math.ceil(source.height * scale)
  checkRasterSize(width, height)
  await document.fonts.ready
  const url = URL.createObjectURL(new Blob([source.svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前环境无法创建图片画布')
    context.drawImage(image, 0, 0, width, height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}
const canvasPng = async (canvas: HTMLCanvasElement): Promise<Uint8Array> => {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error('PNG 编码失败'))
    }, 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}
export const createExport = async (
  workbook: MindMapWorkbook,
  options: ExportOptions,
): Promise<ExportRequest> => {
  const sheet = workbook.sheets.find((entry) => entry.id === options.sheetId)
  if (!sheet) throw new Error('导出的画布不存在')
  const selected = exportSheets(workbook, options.wholeWorkbook ? undefined : sheet.id)
  const encoder = new TextEncoder()
  let bytes: Uint8Array
  switch (options.format) {
    case 'md':
      bytes = encoder.encode(encodeMarkdown(selected))
      break
    case 'opml':
      bytes = encoder.encode(encodeOpml(selected))
      break
    case 'txt':
      bytes = encoder.encode(encodeText(selected))
      break
    case 'xmind':
      bytes = encodeXmind(selected)
      break
    default: {
      await prepareMarkerIcons(sheet.document)
      const source = renderSheetSvg(sheet.document, options.includeCollapsed)
      if (options.format === 'svg') bytes = encoder.encode(source.svg)
      else {
        const canvas = await rasterize(source, options.scale ?? 1)
        try {
          const png = await canvasPng(canvas)
          if (options.format === 'png') bytes = png
          else {
            const { jsPDF } = await import('jspdf')
            const landscape = source.width > source.height
            const pdf = new jsPDF({
              orientation: landscape ? 'landscape' : 'portrait',
              unit: 'pt',
              format: 'a3',
              compress: true,
            })
            const pageWidth = pdf.internal.pageSize.getWidth()
            const pageHeight = pdf.internal.pageSize.getHeight()
            const ratio = Math.min(
              (pageWidth - 48) / source.width,
              (pageHeight - 48) / source.height,
            )
            const width = source.width * ratio
            const height = source.height * ratio
            pdf.addImage(
              png,
              'PNG',
              (pageWidth - width) / 2,
              (pageHeight - height) / 2,
              width,
              height,
            )
            bytes = new Uint8Array(pdf.output('arraybuffer'))
          }
        } finally {
          canvas.width = 0
          canvas.height = 0
        }
      }
    }
  }
  const name =
    (options.wholeWorkbook && ['md', 'opml', 'txt', 'xmind'].includes(options.format)
      ? workbook.title
      : sheet.name
    )
      .replace(/[\p{Cc}<>:"/\\|?*]/gu, '_')
      .slice(0, 100) || 'Trelyx'
  return { format: options.format, suggestedName: `${name}.${options.format}`, bytes }
}
export const downloadExport = (request: ExportRequest): Promise<string> => {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(request.bytes)], { type: mimeTypes[request.format] }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = request.suggestedName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Downloads start asynchronously; releasing on the next task can cancel Safari's download.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 60_000)
  return Promise.resolve(request.suggestedName)
}
