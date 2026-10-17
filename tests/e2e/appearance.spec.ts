import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { decodeTrelyx } from '@formats/trelyx'
import { openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'

const appearance = async (page: Page, name: string) => {
  await page.getByRole('button', { name: '应用外观', exact: true }).click()
  await page.getByRole('menuitemradio', { name, exact: true }).click()
}
const palette = async (page: Page, name: string) => {
  await dockAction(page, '布局与主题')
  await page.getByRole('button', { name: `使用${name}配色`, exact: true }).click()
  await page.keyboard.press('Escape')
}
const download = async (page: Page) => {
  const ready = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+s')
  const path = await (await ready).path()
  if (!path) throw new Error('未下载文件')
  return { workbook: decodeTrelyx(await readFile(path)), path }
}

test('外观默认跟随系统、自动更新、显式选择不被覆盖，重载持久保留选择', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text())
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await appearance(page, '浅色')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await appearance(page, '跟随系统')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('trelyx-appearance'))).toBe('system')
  await expect(page.getByTestId('topic-root')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('二维三维导图配色与应用外观独立，切换只撤销导图且保存重开一致', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await openExample(page)
  await appearance(page, '深色')
  await palette(page, '夜航')
  await expect(page.locator('.canvas')).toHaveCSS('background-color', 'rgb(25, 28, 34)')
  await appearance(page, '浅色')
  await expect(page.locator('.canvas')).toHaveCSS('background-color', 'rgb(25, 28, 34)')
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  const root = page.getByRole('button', { name: '选择主题 产品规划', exact: true })
  await expect(root).toBeVisible()
  await expect(root).toHaveCSS('color', 'rgb(255, 255, 255)')
  await page.screenshot({ path: testInfo.outputPath('3d-night-light-ui.png') })
  await appearance(page, '深色')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(root).toHaveCSS('color', 'rgb(255, 255, 255)')
  await page.screenshot({
    path: testInfo.outputPath('3d-night-dark-ui.png'),
    animations: 'disabled',
  })
  await palette(page, '海洋')
  const saved = await download(page)
  expect(saved.workbook.sheets[0]?.document.settings?.theme).toBe('ocean')
  expect(JSON.stringify(saved.workbook)).not.toContain('trelyx-appearance')
  await dockAction(page, '撤销')
  const nightFile = await download(page)
  expect(nightFile.workbook.sheets[0]?.document.settings?.theme).toBe('night')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '二维视图', exact: true }).click()
  await expect(page.locator('.canvas')).toHaveCSS('background-color', 'rgb(25, 28, 34)')
  const file = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '打开导图', exact: true }).click()
  await (await file).setFiles(nightFile.path)
  await expect(page.locator('.canvas')).toHaveCSS('background-color', 'rgb(25, 28, 34)')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('自定义配色草稿取消不改文档，应用一次可撤销并随文件保存', async ({ page }) => {
  await openExample(page)
  await dockAction(page, '布局与主题')
  await page.getByRole('radio', { name: '自定义配色', exact: true }).click()
  await page.getByRole('textbox', { name: '配色名称', exact: true }).fill('中文工作配色')
  await page.keyboard.press('Escape')
  expect(
    (await download(page)).workbook.sheets[0]?.document.settings?.customPalette,
  ).toBeUndefined()
  await dockAction(page, '布局与主题')
  await page.getByRole('radio', { name: '自定义配色', exact: true }).click()
  await page.getByRole('textbox', { name: '配色名称', exact: true }).fill('中文工作配色')
  await page.getByLabel('中心主题', { exact: true }).fill('#123456')
  await page.getByLabel('分支 2', { exact: true }).fill('#abcdef')
  await page.getByLabel('画布背景', { exact: true }).fill('#f7f8f9')
  await page.getByRole('button', { name: '应用配色', exact: true }).click()
  const custom = (await download(page)).workbook.sheets[0]?.document.settings?.customPalette
  expect(custom).toMatchObject({ name: '中文工作配色', root: '#123456', background: '#f7f8f9' })
  expect(custom?.branches[1]).toBe('#abcdef')
  await dockAction(page, '撤销')
  expect(
    (await download(page)).workbook.sheets[0]?.document.settings?.customPalette,
  ).toBeUndefined()
})

test('浅深色配色浮层与窄窗不遮挡Sheet，键盘关闭恢复Dock', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await openExample(page)
  const inspector = page.getByRole('button', { name: '样式面板', exact: true })
  if ((await inspector.getAttribute('aria-pressed')) === 'true') await inspector.click()
  for (const [mode, scheme] of [
    ['浅色', 'Trelyx'],
    ['深色', '夜航'],
  ] as const) {
    await appearance(page, mode)
    await palette(page, scheme)
    await dockAction(page, '布局与主题')
    await expect(page.getByRole('group', { name: '导图配色预设' }).getByRole('button')).toHaveCount(
      8,
    )
    await page.screenshot({ path: testInfo.outputPath(mode === '浅色' ? 'light.png' : 'dark.png') })
    await page.keyboard.press('Escape')
  }
  await page.setViewportSize({ width: 800, height: 600 })
  await dockAction(page, '布局与主题')
  const bounds = await page.getByRole('dialog', { name: '布局与主题', exact: true }).boundingBox()
  expect(bounds).toBeTruthy()
  if (bounds) {
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(552)
  }
  await page.screenshot({ path: testInfo.outputPath('narrow.png') })
  await page.getByRole('radio', { name: '字体与线条', exact: true }).click()
  await page.getByRole('combobox', { name: '全局字体', exact: true }).click()
  await page.getByRole('option', { name: '衬线字体', exact: true }).click()
  await expect(page.locator('.canvas')).toHaveCSS('font-family', 'serif')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '布局与主题', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '展开浮动工具栏', exact: true })).toBeFocused()
})
