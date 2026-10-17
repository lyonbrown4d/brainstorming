import 'dotenv/config'

export const validateRendererURL = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error('ELECTRON_RENDERER_URL 必须是本机 HTTP 地址')
  }
  return url.href
}

export const desktopConfig = {
  rendererURL: validateRendererURL(process.env.ELECTRON_RENDERER_URL),
}
