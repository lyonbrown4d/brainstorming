import { writeFile } from 'node:fs/promises'
import { browser } from '@wdio/globals'
import { nativeArtifact } from '@tests/native/artifacts'

/** Read the real CEF graphics backend without touching either product canvas. */
export const recordCefGraphics = async (): Promise<void> => {
  const graphics = await browser.execute(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    if (!context) throw new Error('CEF did not create a WebGL2 context')
    const extension = context.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(
      context.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER),
    )
    const vendor = String(context.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR))
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return { renderer, vendor, userAgent: navigator.userAgent, ratio: devicePixelRatio }
  })
  await writeFile(
    await nativeArtifact('cef-graphics.json'),
    JSON.stringify({ platform: process.platform, ...graphics }, null, 2),
  )
}
