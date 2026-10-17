import { seedChinese } from '@tests/electron/preferences'
import { _electron, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startupServer } from '@tests/desktop/startup-server'
import { mainWindow } from '@tests/desktop/windows'

for (const failFirst of [false, true]) {
  test(
    failFirst
      ? '原生启动界面加载失败后重试成功并销毁启动窗'
      : '原生慢启动展示进度与减少动态效果，准备完成后进入首页',
    async () => {
      const testInfo = test.info()
      const directory = await mkdtemp(join(tmpdir(), 'trelyx-startup-ui-'))
      await seedChinese(directory)
      const server = await startupServer({ failFirst })
      const app = await _electron.launch({
        colorScheme: null,
        args: ['.', `--user-data-dir=${directory}`],
        env: { ...process.env, ELECTRON_RENDERER_URL: server.url },
      })
      try {
        const splash = await app.firstWindow()
        await splash.emulateMedia({ reducedMotion: 'reduce' })
        await server.editorRequested
        const region = splash.getByRole('region', { name: '启动 Trelyx', exact: true })
        await expect(region).toBeVisible()
        await expect(region.getByRole('heading', { name: 'Trelyx', exact: true })).toBeVisible()
        await expect(splash.locator('#startup-indicator')).toHaveCSS('animation-name', 'none')
        await expect
          .poll(() =>
            app.evaluate(({ BrowserWindow }) =>
              BrowserWindow.getAllWindows()
                .find((window) => !window.webContents.getURL().includes('/splash.html'))
                ?.isVisible(),
            ),
          )
          .toBe(false)
        if (!failFirst) {
          await expect(region.getByRole('status')).toContainText('启动时间较长', {
            timeout: 20_000,
          })
          await expect(region.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
        }
        if (!failFirst)
          await splash.screenshot({ path: testInfo.outputPath('native-startup-slow.png') })
        server.release()
        if (failFirst) {
          await expect(region.getByRole('alert')).toContainText('界面加载失败')
          await splash.screenshot({ path: testInfo.outputPath('native-startup-failure.png') })
          await region.getByRole('button', { name: '重新加载', exact: true }).click()
        }
        const page = await mainWindow(app)
        await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeEnabled()
        await expect.poll(() => app.windows().length).toBe(1)
        await page.getByRole('button', { name: '下一步', exact: true }).click()
        await page.getByRole('button', { name: '创建文档', exact: true }).click()
        await expect(page.getByTestId('topic-root')).toContainText('新的想法')
        await expect(page.locator('#startup-screen')).toHaveCount(0)
      } finally {
        app.process().kill('SIGKILL')
        await server.close()
        await rm(directory, { recursive: true, force: true })
      }
    },
  )
}
