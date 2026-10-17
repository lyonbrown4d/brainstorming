import { expect, type ElectronApplication, type Page } from '@playwright/test'

/** The first native window is the splash; select the document window by its real entry. */
export const mainWindow = async (app: ElectronApplication): Promise<Page> => {
  const find = () =>
    app.windows().find((page) => {
      const url = new URL(page.url())
      return (
        ['file:', 'http:', 'https:'].includes(url.protocol) &&
        !url.pathname.endsWith('/splash.html')
      )
    })
  await expect.poll(find).toBeTruthy()
  const page = find()
  if (!page) throw new Error('主窗口未打开')
  await page.waitForLoadState('domcontentloaded')
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some(
          (window) => !window.webContents.getURL().includes('/splash.html') && window.isVisible(),
        ),
      ),
    )
    .toBe(true)
  return page
}
