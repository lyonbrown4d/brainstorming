import { setSystemTheme } from '@tests/electron/session'
import { canvasProperties } from '@tests/e2e/properties'
import { prepareNativeSave, prepareNativeOpen } from '@tests/electron/native-files'
import { resizeWindow } from '@tests/electron/session'
import { reloadWindow } from '@tests/electron/session'
import { expect, test, type Page } from '@tests/electron/fixture'
import { readFile } from 'node:fs/promises'
import { decodeTrelyx } from '@formats/trelyx'
import { openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'

const appearance = async (page: Page, name: string) => {
  await page.getByRole('button', { name: '应用外观', exact: true }).click()
  await page.getByRole('menuitemradio', { name, exact: true }).click()
}
const palette = async (page: Page, name: string) => {
  await canvasProperties(page)
  await page.getByRole('radio', { name: '预设配色', exact: true }).click()
  await page.getByRole('button', { name: `使用${name}配色`, exact: true }).click()
  await page.keyboard.press('Escape')
}
const saveWorkbook = async (page: Page) => {
  const ready = await prepareNativeSave(page)
  await page.keyboard.press('ControlOrMeta+s')
  const path = await ready.path()
  if (!path) throw new Error('未生成原生文件')
  return { workbook: decodeTrelyx(await readFile(path)), path }
}

test('外观默认跟随系统、自动更新、显式选择不被覆盖，重载持久保留选择', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text())
  })
  await setSystemTheme(page, 'dark')
  await reloadWindow(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await appearance(page, '浅色')
  await setSystemTheme(page, 'light')
  await setSystemTheme(page, 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await reloadWindow(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await appearance(page, '跟随系统')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await setSystemTheme(page, 'light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('trelyx-appearance'))).toBe('system')
  await expect(page.getByTestId('topic-root')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('二维三维导图配色与应用外观独立，切换只撤销导图且保存重开一致', async ({ page }, testInfo) => {
  await resizeWindow(page, { width: 1440, height: 1024 })
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
  const saved = await saveWorkbook(page)
  expect(saved.workbook.sheets[0]?.document.settings?.theme).toBe('ocean')
  expect(JSON.stringify(saved.workbook)).not.toContain('trelyx-appearance')
  await dockAction(page, '撤销')
  const nightFile = await saveWorkbook(page)
  expect(nightFile.workbook.sheets[0]?.document.settings?.theme).toBe('night')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '二维视图', exact: true }).click()
  await expect(page.locator('.canvas')).toHaveCSS('background-color', 'rgb(25, 28, 34)')
  await reloadWindow(page)
  const file = await prepareNativeOpen(page)
  await page.getByRole('button', { name: '打开本地文件', exact: true }).click()
  await file.selectFile(nightFile.path)
  await expect(page.locator('.canvas')).toHaveCSS('background-color', 'rgb(25, 28, 34)')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('自定义配色草稿取消不改文档，应用一次可撤销并随文件保存', async ({ page }) => {
  await openExample(page)
  await canvasProperties(page)
  await page.getByRole('radio', { name: '自定义配色', exact: true }).click()
  await page.getByRole('textbox', { name: '配色名称', exact: true }).fill('中文工作配色')
  await page.keyboard.press('Escape')
  expect(
    (await saveWorkbook(page)).workbook.sheets[0]?.document.settings?.customPalette,
  ).toBeUndefined()
  await canvasProperties(page)
  await page.getByRole('radio', { name: '自定义配色', exact: true }).click()
  await page.getByRole('textbox', { name: '配色名称', exact: true }).fill('中文工作配色')
  await page.getByLabel('中心主题', { exact: true }).fill('#123456')
  await page.getByLabel('分支 2', { exact: true }).fill('#abcdef')
  await page.getByLabel('画布背景', { exact: true }).fill('#f7f8f9')
  await page.getByRole('button', { name: '应用配色', exact: true }).click()
  const custom = (await saveWorkbook(page)).workbook.sheets[0]?.document.settings?.customPalette
  expect(custom).toMatchObject({ name: '中文工作配色', root: '#123456', background: '#f7f8f9' })
  expect(custom?.branches[1]).toBe('#abcdef')
  await dockAction(page, '撤销')
  expect(
    (await saveWorkbook(page)).workbook.sheets[0]?.document.settings?.customPalette,
  ).toBeUndefined()
})

test('浅深色画布属性与窄窗可滚动访问，设置不遮挡 Sheet', async ({ page }, testInfo) => {
  await resizeWindow(page, { width: 1440, height: 1024 })
  await openExample(page)
  for (const [mode, scheme] of [
    ['浅色', 'Trelyx'],
    ['深色', '夜航'],
  ] as const) {
    await appearance(page, mode)
    await palette(page, scheme)
    await expect(page.getByRole('group', { name: '导图配色预设' }).getByRole('button')).toHaveCount(
      8,
    )
    await page.screenshot({ path: testInfo.outputPath(mode === '浅色' ? 'light.png' : 'dark.png') })
  }
  await resizeWindow(page, { width: 800, height: 600 })
  const panel = await canvasProperties(page)
  await panel.getByRole('radio', { name: '字体与线条', exact: true }).click()
  await page.getByRole('combobox', { name: '全局字体', exact: true }).click()
  await page.getByRole('option', { name: '衬线字体', exact: true }).click()
  await expect(page.locator('.canvas')).toHaveCSS('font-family', 'serif')
  const bounds = await panel.boundingBox()
  const footer = await page.locator('.status-bar').boundingBox()
  if (!bounds || !footer) throw new Error('属性面板或底栏不可见')
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(800)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(footer.y)
  await page.screenshot({ path: testInfo.outputPath('narrow.png') })
  await panel.getByRole('button', { name: '关闭属性面板', exact: true }).click()
  await expect(panel).toBeHidden()
  const toggle = page.getByRole('button', { name: '属性面板', exact: true })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await expect(
    page
      .getByRole('tablist', { name: '文档画布', exact: true })
      .getByRole('tab', { name: '产品总览', exact: true }),
  ).toBeVisible()
})
