// Bundle capture rules so Tauri CSP permits them in release builds.
import '@renderer/styles/export-capture.scss'
import type { DocumentExportsAPI, ExportPage } from '@shared/documentExports'

/** Native WebView snapshot preserves the current 3D projection without a second renderer. */
export const captureCurrentExportView = async (api: DocumentExportsAPI): Promise<ExportPage> => {
  if (!api.captureView) throw new Error('当前平台不支持视角截图。')
  const canvas = document.querySelector<HTMLElement>('.react-flow')
  if (!canvas) throw new Error('请返回 3D 画布后导出当前视角。')
  const rect = canvas.getBoundingClientRect()
  const before = document.documentElement.getAttribute('data-export-capture')
  try {
    document.documentElement.setAttribute('data-export-capture', '')
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve()
        })
      }),
    )
    const overlays = document.querySelectorAll<HTMLElement>(
      '[data-slot="dialog-content"], [data-slot="dialog-overlay"]',
    )
    if ([...overlays].some((element) => Number(getComputedStyle(element).opacity) > 0))
      throw new Error('截图界面尚未准备好，请重试。')
    return await api.captureView({
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.min(rect.width, innerWidth - rect.x),
      height: Math.min(rect.height, innerHeight - rect.y),
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    })
  } finally {
    if (before === null) document.documentElement.removeAttribute('data-export-capture')
    else document.documentElement.setAttribute('data-export-capture', before)
  }
}
