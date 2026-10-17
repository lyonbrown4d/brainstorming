// Install React Scan's DevTools hook before importing React and the application.
// Vite replaces DEV at build time, removing the scanner from production chunks.
if (import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN !== 'false') {
  try {
    const { scan } = await import('react-scan')
    scan({ enabled: true, showToolbar: true })
  } catch (error) {
    console.warn('React Scan 初始化失败，编辑器将继续启动。', error)
  }
}
const { initializeI18n } = await import('@renderer/i18n')
const { requireDesktopAPI } = await import('@renderer/lib/desktop')
await initializeI18n(await requireDesktopAPI().getLanguage())
await import('@renderer/mountApp')
