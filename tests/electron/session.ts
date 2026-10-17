import { expect, type ElectronApplication, type Page } from '@playwright/test'

interface NativeSession {
  app: ElectronApplication
  directory: string
}
const sessions = new WeakMap<Page, NativeSession>()
export const registerSession = (page: Page, session: NativeSession): void => {
  sessions.set(page, session)
}
export const nativeSession = (page: Page): NativeSession => {
  const session = sessions.get(page)
  if (!session) throw new Error('页面不属于真实 Electron 测试会话')
  return session
}
export const reloadWindow = async (page: Page): Promise<void> => {
  const { app } = nativeSession(page)
  const loaded = page.waitForEvent('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(
      (entry) => !entry.webContents.getURL().includes('/splash.html'),
    )
    if (!window) throw new Error('主窗口不存在')
    window.webContents.reload()
  })
  await loaded
  await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeEnabled()
}
export const resizeWindow = async (
  page: Page,
  size: { width: number; height: number },
): Promise<void> => {
  await nativeSession(page).app.evaluate(({ BrowserWindow }, dimensions) => {
    const window = BrowserWindow.getAllWindows().find(
      (entry) => !entry.webContents.getURL().includes('/splash.html'),
    )
    if (!window) throw new Error('主窗口不存在')
    window.setMinimumSize(400, 300)
    window.setContentSize(dimensions.width, dimensions.height)
  }, size)
}
export const tapWindow = async (page: Page, label: string): Promise<void> => {
  const bounds = await page.getByRole('button', { name: label, exact: true }).boundingBox()
  if (!bounds) throw new Error('触摸目标不可见')
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }],
    })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: false })
    await session.detach()
  }
}
export const setSystemTheme = async (page: Page, scheme: 'light' | 'dark'): Promise<void> => {
  await nativeSession(page).app.evaluate(({ nativeTheme }, value) => {
    nativeTheme.themeSource = value
  }, scheme)
}
