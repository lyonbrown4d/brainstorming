import { expect, test } from '@playwright/test'
import { dockAction, moreTools, openDock } from './dock'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('Dock hover、延迟收起、键盘聚焦和弹出面板保持展开', async ({ page }, testInfo) => {
  const handle = page.getByRole('button', { name: '展开浮动工具栏', exact: true })
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('toolbar', { name: '导图操作', exact: true })).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('dock-collapsed.png') })
  await openDock(page)
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  // Capture the final Dock geometry after the 180 ms layout transition.
  await page.waitForTimeout(250)
  await page.screenshot({ path: testInfo.outputPath('dock-expanded.png') })
  await page.mouse.move(20, 200)
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
  await handle.focus()
  await page.keyboard.press('Enter')
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: '更多导图工具', exact: true }).click()
  await expect(page.getByRole('button', { name: '布局与主题', exact: true })).toBeVisible()
  await page.mouse.move(20, 200)
  // The nested portal must stay usable after the normal collapse delay.
  await page.waitForTimeout(600)
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: '布局与主题', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '画布布局', exact: true })).toBeVisible()
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
  await moreTools(page)
  await page.getByRole('button', { name: '布局与主题', exact: true }).click()
  await page.getByRole('combobox', { name: '画布布局', exact: true }).click()
  await page.getByRole('option', { name: '向下组织图', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '画布布局', exact: true })).toHaveText(
    '向下组织图',
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
  test.use({ hasTouch: true })
  test('没有 hover 时点击入口展开并再次点击收起', async ({ page }) => {
    const handle = page.getByRole('button', { name: '展开浮动工具栏', exact: true })
    await expect(handle).toHaveAttribute('aria-expanded', 'false')
    await handle.tap()
    await expect(handle).toHaveAttribute('aria-expanded', 'true')
    await handle.tap()
    await expect(handle).toHaveAttribute('aria-expanded', 'false')
  })
})
