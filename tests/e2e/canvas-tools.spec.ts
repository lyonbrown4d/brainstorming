import { tapWindow } from '@tests/electron/session'
import { canvasProperties } from '@tests/e2e/properties'
import { resizeWindow } from '@tests/electron/session'
import { openExample } from '@tests/e2e/workspace'
import { expect, test } from '@tests/electron/fixture'
import { dockAction, openDock } from '@tests/e2e/dock'

test.beforeEach(async ({ page }) => {
  await openExample(page)
})

test('Dock hover、延迟收起、键盘聚焦和弹出面板保持展开', async ({ page }, testInfo) => {
  const handle = page.getByRole('button', { name: '展开浮动工具栏', exact: true })
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('toolbar', { name: '导图操作', exact: true })).toBeHidden()
  const initial = await handle.boundingBox()
  const canvas = await page.getByRole('tabpanel', { name: '当前画布', exact: true }).boundingBox()
  if (!initial || !canvas) throw new Error('缺少 Dock 或画布')
  expect(initial.y).toBeGreaterThan(canvas.y + canvas.height * 0.75)
  expect(initial.y + initial.height).toBeLessThan(canvas.y + canvas.height)
  await page.screenshot({ path: testInfo.outputPath('dock-collapsed.png') })
  await openDock(page)
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  // Capture the final geometry after the width spring settles.
  await page.waitForTimeout(600)
  await page.screenshot({ path: testInfo.outputPath('dock-expanded.png') })
  await page.mouse.move(20, 200)
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
  await handle.focus()
  await page.keyboard.press('Enter')
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: '主题筛选', exact: true }).click()
  const layout = page.getByRole('dialog', { name: '主题筛选', exact: true })
  await expect(layout).toBeVisible()
  await page.mouse.move(20, 200)
  // The nested portal must stay usable after the normal collapse delay.
  await page.waitForTimeout(600)
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  await expect(layout.getByRole('combobox', { name: '筛选标签', exact: true })).toBeVisible()
  const panelBounds = await layout.boundingBox()
  const dockBounds = await handle.boundingBox()
  if (!panelBounds || !dockBounds) throw new Error('Dock 或布局面板未显示')
  expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(dockBounds.y)
})

test('关联线直接在画布创建、中文原位编辑、取消模式和撤销', async ({ page }) => {
  await page.getByTestId('topic-vision').click()
  await dockAction(page, '关联线')
  await page.mouse.move(20, 200)
  await expect(page.getByRole('button', { name: '展开浮动工具栏' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: '点击目标主题建立关联线' })).toBeVisible()
  await page.getByTestId('topic-experience').click()
  const title = page.getByRole('textbox', { name: '编辑关联线名称', exact: true })
  await expect(title).toBeFocused()
  await title.fill('愿景引导体验')
  await title.press('Enter')
  await expect(
    page.getByRole('button', { name: '关联线：愿景引导体验', exact: true }),
  ).toBeVisible()
  await dockAction(page, '撤销')
  await expect(page.getByRole('textbox', { name: '编辑关联线名称' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '关联线：关联线', exact: true })).toBeVisible()
  await dockAction(page, '撤销')
  await expect(page.getByRole('button', { name: /^关联线：/ })).toHaveCount(0)
  await dockAction(page, '关联线')
  await page.keyboard.press('Escape')
  await openDock(page)
  await expect(page.getByRole('button', { name: '关联线', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('多选概要和标注原位编辑；布局面板即时作用于画布', async ({ page }) => {
  await page.getByTestId('topic-vision').click()
  await page.getByTestId('topic-experience').click({ modifiers: ['Shift'] })
  await dockAction(page, '添加概要')
  const title = page.getByRole('textbox', { name: '编辑分组名称', exact: true })
  await expect(title).toBeVisible()
  await title.fill('设计方向')
  await title.press('Enter')
  await expect(page.getByRole('button', { name: '分组：设计方向', exact: true })).toBeVisible()
  await page.getByTestId('topic-vision').click()
  await dockAction(page, '添加标注')
  const callout = page.getByRole('textbox', { name: '编辑标注文字', exact: true })
  await callout.fill('先验证核心假设')
  await callout.press('ControlOrMeta+Enter')
  await expect(
    page.getByRole('button', { name: '标注：先验证核心假设', exact: true }),
  ).toBeVisible()
  await openDock(page)
  await canvasProperties(page, '结构')
  await page.getByRole('button', { name: '应用向下组织图', exact: true }).click()
  await expect(page.getByRole('button', { name: '应用向下组织图', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('[role=dialog][aria-modal=true]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('topic-root')).toBeVisible()
})

test('三维视图也通过主题起终点创建关联并原位编辑', async ({ page }) => {
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  await page.getByRole('button', { name: '选择主题 产品愿景', exact: true }).click()
  await dockAction(page, '关联线')
  await page.getByRole('button', { name: '选择主题 核心体验', exact: true }).click()
  const input = page.getByRole('textbox', { name: '编辑关联线名称', exact: true })
  await expect(input).toBeFocused()
  await input.fill('跨维度关联')
  await input.press('Enter')
  await expect(page.getByRole('button', { name: '关联线：跨维度关联', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '二维视图', exact: true }).click()
  await expect(page.getByRole('button', { name: '关联线：跨维度关联', exact: true })).toBeVisible()
  await dockAction(page, '撤销')
  await expect(page.getByRole('button', { name: '关联线：关联线', exact: true })).toBeVisible()
})

test.describe('触屏 Dock', () => {
  test('没有 hover 时点击入口展开并再次点击收起', async ({ page }) => {
    const handle = page.getByRole('button', { name: '展开浮动工具栏', exact: true })
    await expect(handle).toHaveAttribute('aria-expanded', 'false')
    await tapWindow(page, '展开浮动工具栏')
    await expect(handle).toHaveAttribute('aria-expanded', 'true')
    await tapWindow(page, '展开浮动工具栏')
    await expect(handle).toHaveAttribute('aria-expanded', 'false')
  })
})

test('底部 Dock 单行平铺，横向滚动可达全部工具且不盖住 Sheet', async ({ page }) => {
  await resizeWindow(page, { width: 800, height: 600 })
  await openDock(page)
  const toolbar = page.getByRole('toolbar', { name: '导图操作', exact: true })
  const viewport = toolbar.locator('xpath=ancestor::*[@data-slot="scroll-area-viewport"]')
  await expect.poll(() => viewport.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await expect(page.getByRole('button', { name: '更多导图工具', exact: true })).toHaveCount(0)
  const first = await toolbar.getByRole('button', { name: '添加子主题', exact: true }).boundingBox()
  const last = await toolbar.getByRole('button', { name: 'AI 助手', exact: true }).boundingBox()
  if (!first || !last) throw new Error('工具未平铺')
  expect(Math.abs(first.y - last.y)).toBeLessThan(4)
  await viewport.hover()
  await page.mouse.wheel(600, 0)
  await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100)
  await toolbar.getByRole('button', { name: 'AI 助手', exact: true }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'AI 思维导图助手' })
      .getByRole('button', { name: '服务设置', exact: true }),
  ).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(
    page
      .getByRole('tablist', { name: '文档画布', exact: true })
      .getByRole('tab', { name: '产品总览', exact: true }),
  ).toBeVisible()
  const dock = await toolbar.boundingBox()
  const footer = await page.locator('.status-bar').boundingBox()
  if (!dock || !footer) throw new Error('Dock 或画布标签未显示')
  expect(dock.y + dock.height).toBeLessThan(footer.y)
})
