import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mainWindow } from '@tests/desktop/windows'

test('Electron系统主题事件自动更新；手动外观重启后保留并不受系统覆盖', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trelyx-appearance-'))
  let app = await electron.launch({
    args: ['.', `--user-data-dir=${directory}`],
    colorScheme: null,
  })
  try {
    let page = await mainWindow(app)
    await app.evaluate(({ nativeTheme }) => {
      nativeTheme.themeSource = 'dark'
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await page.evaluate(() => localStorage.getItem('trelyx-appearance'))).not.toBe('dark')
    await page.getByRole('button', { name: '应用外观', exact: true }).click()
    await page.getByRole('menuitemradio', { name: '浅色', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await app.close()
    app = await electron.launch({ args: ['.', `--user-data-dir=${directory}`], colorScheme: null })
    page = await mainWindow(app)
    await app.evaluate(({ nativeTheme }) => {
      nativeTheme.themeSource = 'dark'
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => localStorage.getItem('trelyx-appearance'))).toBe('light')
    await page.getByRole('button', { name: '应用外观', exact: true }).click()
    await page.getByRole('menuitemradio', { name: '跟随系统', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await app.evaluate(({ nativeTheme }) => {
      nativeTheme.themeSource = 'light'
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => localStorage.getItem('trelyx-appearance'))).toBe('system')
  } finally {
    app.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})
