import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('自定义标题栏保留操作、窄窗布局与原生全屏状态', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trelyx-window-'))
  const app = await electron.launch({ args: ['.', `--user-data-dir=${directory}`] })
  try {
    const page = await app.firstWindow()
    const shell = page.locator('.app-shell')
    const platform =
      process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'
    await expect(shell).toHaveAttribute('data-platform', platform)
    const toolbar = page.locator('.toolbar')
    await expect(toolbar).toHaveCSS('-webkit-app-region', 'drag')
    await expect(page.getByRole('button', { name: '新建导图', exact: true })).toHaveCSS(
      '-webkit-app-region',
      'no-drag',
    )
    await page.getByRole('button', { name: '文档大纲', exact: true }).click()
    await expect(page.locator('.outline-panel')).toBeVisible()
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(800, 600)
    })
    const save = page.getByRole('button', { name: '保存导图', exact: true })
    await expect(save).toBeVisible()
    const layout = await toolbar.evaluate((element) => {
      const titleElement = element.querySelector('h1')
      const actionsElement = element.querySelector('.toolbar-actions')
      if (!titleElement || !actionsElement) throw new Error('Missing toolbar content')
      const title = titleElement.getBoundingClientRect()
      const actions = actionsElement.getBoundingClientRect()
      return {
        titleRight: title.right,
        actionsLeft: actions.left,
        actionsRight: actions.right,
        width: innerWidth,
      }
    })
    expect(layout.titleRight).toBeLessThanOrEqual(layout.actionsLeft)
    expect(layout.actionsRight).toBeLessThanOrEqual(layout.width)
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window?.show()
      window?.focus()
      window?.setFullScreen(true)
    })
    await expect
      .poll(
        () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen()),
        { timeout: 15_000 },
      )
      .toBe(true)
    await expect(shell).toHaveAttribute('data-fullscreen', 'true')
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setFullScreen(false)
    })
    await expect(shell).toHaveAttribute('data-fullscreen', 'false')
    if (platform === 'macos') await expect(toolbar).toHaveCSS('padding-left', '112px')
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window?.setSize(1280, 850)
      window?.focus()
    })
    await expect(shell).toHaveAttribute('data-focused', 'true')
    await page.screenshot({ path: '/tmp/trelyx-custom-titlebar.png' })
  } finally {
    app.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})
