import { expect, test } from '@playwright/test'

const editorModule = /\/src\/main\.tsx(?:\?|$)/

test('编辑器下载期间先显示启动画面，慢启动后仍可进入首页，减少动态效果设置生效', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  let release: (() => void) | undefined
  const download = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(editorModule, async (route) => {
    await download
    await route.continue()
  })
  try {
    const requested = page.waitForRequest(editorModule)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await requested
    const splash = page.getByRole('region', { name: '启动 Trelyx', exact: true })
    await expect(splash).toBeVisible()
    await expect(splash).toHaveCSS('background-color', 'rgb(243, 242, 248)')
    await expect(splash.getByRole('heading', { name: 'Trelyx', exact: true })).toBeVisible()
    await expect(splash.getByRole('status')).toHaveText('正在准备工作空间…')
    await expect(page.locator('#startup-indicator')).toHaveCSS('animation-name', 'none')
    await expect(page.getByRole('button', { name: '探索示例', exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('trelyx-splash.png') })
    await page.clock.fastForward(15_000)
    await expect(splash.getByRole('status')).toContainText('启动时间较长')
    await expect(splash.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    release?.()
    await page.clock.resume()
    await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeEnabled()
    await expect(splash).toHaveCount(0)
    await page.getByRole('button', { name: '创建文档', exact: true }).click()
    await expect(page.getByTestId('topic-root')).toContainText('新的想法')
    await expect(splash).toHaveCount(0)
  } finally {
    release?.()
  }
})

test('界面模块加载失败显示重试，重新加载成功后自动移除启动画面', async ({ page }, testInfo) => {
  let failed = false
  await page.route(editorModule, async (route) => {
    if (failed) await route.continue()
    else {
      failed = true
      await route.abort('failed')
    }
  })
  await page.goto('/')
  const splash = page.getByRole('region', { name: '启动 Trelyx', exact: true })
  await expect(splash.getByRole('alert')).toHaveText('界面加载失败，请重新加载后重试。')
  await expect(splash).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('#startup-indicator')).toBeHidden()
  await expect(page.getByRole('button', { name: '创建文档', exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('trelyx-splash-error.png') })
  await splash.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByRole('button', { name: '创建文档', exact: true })).toBeEnabled()
  await expect(splash).toHaveCount(0)
})
