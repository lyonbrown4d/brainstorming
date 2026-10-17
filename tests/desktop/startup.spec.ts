import { seedChinese } from '@tests/electron/preferences'
import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mainWindow } from '@tests/desktop/windows'
import { startupServer } from '@tests/desktop/startup-server'
import { storageOperation } from '@tests/electron/storage'

for (const language of ['zh-CN', 'en'] as const) {
  test(`独立原生启动窗口使用 ${language}，失败后重试，首帧就绪才显示主窗并销毁启动窗`, async () => {
    const testInfo = test.info()
    const directory = await mkdtemp(join(tmpdir(), 'brainstorming-splash-'))
    await seedChinese(directory)
    await storageOperation('language:set', directory, language)
    const server = await startupServer()
    const app = await electron.launch({
      colorScheme: null,
      args: ['.', `--user-data-dir=${directory}`],
      env: { ...process.env, ELECTRON_RENDERER_URL: server.url },
    })
    try {
      const splash = await app.firstWindow()
      const english = language === 'en'
      await expect(
        splash.getByRole('region', {
          name: english ? 'Starting Brainstorming' : '启动 Brainstorming',
          exact: true,
        }),
      ).toBeVisible()
      await expect(splash.locator('html')).toHaveAttribute('lang', language)
      await expect(splash.getByRole('status')).toContainText(
        english ? 'Preparing your workspace' : '正在准备工作空间',
      )
      await expect(
        splash.getByRole('button', {
          name: english ? 'Quit Brainstorming' : '退出 Brainstorming',
          exact: true,
        }),
      ).toBeEnabled()
      await server.editorRequested
      const windows = () =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((window) => ({
            splash: window.webContents.getURL().includes('/splash.html'),
            visible: window.isVisible(),
          })),
        )
      await expect.poll(windows).toEqual(
        expect.arrayContaining([
          { splash: true, visible: true },
          { splash: false, visible: false },
        ]),
      )
      expect(await splash.evaluate(() => typeof window.brainstorming)).toBe('undefined')
      // The splash never receives the document renderer's ready capability.
      expect(await splash.evaluate(() => typeof window.brainstormingStartup)).toBe('undefined')
      await splash.evaluate(() => window.brainstormingSplash?.mounted())
      expect(await windows()).toContainEqual({ splash: false, visible: false })
      await splash.screenshot({ path: testInfo.outputPath('brainstorming-native-splash.png') })
      server.release()
      await expect(splash.getByRole('alert')).toContainText(
        english ? 'The interface could not load' : '界面加载失败',
      )
      expect(await windows()).toContainEqual({ splash: false, visible: false })
      await splash
        .getByRole('button', { name: english ? 'Reload' : '重新加载', exact: true })
        .click()
      const page = await mainWindow(app)
      await expect(
        page.getByRole('button', { name: english ? 'Next' : '下一步', exact: true }),
      ).toBeEnabled()
      await expect.poll(windows).toEqual([{ splash: false, visible: true }])
      await expect(page.locator('#startup-screen')).toHaveCount(0)
    } finally {
      app.process().kill('SIGKILL')
      await server.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
}

test('启动期间退出会关闭隐藏主窗口并结束进程', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-splash-quit-'))
  await seedChinese(directory)
  const server = await startupServer()
  const app = await electron.launch({
    colorScheme: null,
    args: ['.', `--user-data-dir=${directory}`],
    env: { ...process.env, ELECTRON_RENDERER_URL: server.url },
  })
  const child = app.process()
  try {
    const splash = await app.firstWindow()
    await server.editorRequested
    const closed = app.waitForEvent('close')
    await splash.getByRole('button', { name: '退出 Brainstorming', exact: true }).click()
    await closed
    await expect.poll(() => child.exitCode).toBe(0)
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL')
    await server.close()
    await rm(directory, { recursive: true, force: true })
  }
})
