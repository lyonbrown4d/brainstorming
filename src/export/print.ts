import { createWorkbook } from '@core'
import { translate } from '@renderer/i18n'
import type { MindMapDocument } from '@core'
import { prepareSheetImage } from '@renderer/export/images'

/** Print the complete pure-layout SVG in an isolated, scriptless document. */
export const printSheet = async (
  document: MindMapDocument,
  includeCollapsed = false,
): Promise<void> => {
  const prepared = createWorkbook(document)
  const sheet = prepared.sheets[0]
  if (!sheet) throw new Error(translate('exportImageResourceIsMissing'))
  const source = await prepareSheetImage(prepared, sheet.id, includeCollapsed)
  const url = URL.createObjectURL(new Blob([source.svg], { type: 'image/svg+xml;charset=utf-8' }))
  const frame = window.document.createElement('iframe')
  frame.title = translate('brainstormingFullMapPrint')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.tabIndex = -1
  frame.referrerPolicy = 'no-referrer'
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1123px;height:1587px;border:0;pointer-events:none'
  let released = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => {
    if (released) return
    released = true
    if (timer) clearTimeout(timer)
    window.removeEventListener('pagehide', cleanup)
    URL.revokeObjectURL(url)
    frame.remove()
  }
  try {
    window.document.body.appendChild(frame)
    const target = frame.contentDocument
    const targetWindow = frame.contentWindow
    if (!target || !targetWindow) throw new Error(translate('couldNotCreatePrintDocument'))
    target.title = document.title
    const style = target.createElement('style')
    const landscape = source.width > source.height
    // Fixed page bounds make the entire vector map fit one sheet, independent of viewport size.
    style.textContent = `@page{size:A3 ${landscape ? 'landscape' : 'portrait'};margin:12mm}html,body{margin:0;padding:0;background:white}body{width:${landscape ? 396 : 273}mm;height:${landscape ? 273 : 396}mm}img{display:block;width:100%;height:100%;object-fit:contain;break-inside:avoid}`
    target.head.appendChild(style)
    const image = target.createElement('img')
    image.alt = document.title
    image.src = url
    target.body.appendChild(image)
    await image.decode()
    await target.fonts.ready
    targetWindow.addEventListener('afterprint', cleanup, { once: true })
    window.addEventListener('pagehide', cleanup, { once: true })
    // Some embedded browsers omit afterprint; retain the prepared document long enough for the dialog.
    timer = setTimeout(cleanup, 5 * 60_000)
    targetWindow.focus()
    targetWindow.print()
  } catch (cause) {
    cleanup()
    throw new Error(translate('couldNotOpenPrintDialogExportPdf'), { cause })
  }
}
