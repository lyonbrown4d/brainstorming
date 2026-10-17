if (import.meta.env.VITE_NATIVE_E2E === '1') {
  await import('@wdio/tauri-plugin')
}
// Install React Scan's DevTools hook before importing React and the application.
// Vite replaces DEV at build time, removing the scanner from production chunks.
if (import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN !== 'false') {
  try {
    await import('@renderer/dev/reactScan')
  } catch (error) {
    console.warn('React Scan 初始化失败，编辑器将继续启动。', error)
  }
}
const { initializeI18n } = await import('@renderer/i18n')
const { initializePlatformAPI } = await import('@renderer/lib/desktop')
const platform = await initializePlatformAPI()
await initializeI18n(await platform.getLanguage())
await import('@renderer/mountApp')
