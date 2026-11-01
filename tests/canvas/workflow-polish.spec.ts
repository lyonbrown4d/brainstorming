import { expect, test, type Page } from '@playwright/test'

const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-画布筛选--default&viewMode=story')
  await expect(page.getByTestId('topic-root')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
}

test('document and tool docks pin independently and retain the local preference', async ({
  page,
}) => {
  await open(page)
  const top = page.getByRole('button', { name: '展开导图标签栏', exact: true })
  const bottom = page.getByRole('button', { name: '展开浮动工具栏', exact: true })
  await expect(top).toContainText('筛选示例')
  await expect(top).toContainText('1 份导图')
  await top.hover()
  await page.getByRole('button', { name: '固定文档标签', exact: true }).click()
  await page.mouse.move(20, 200)
  await page.keyboard.press('Escape')
  await expect(top).toHaveAttribute('aria-expanded', 'true')
  await expect(bottom).toHaveAttribute('aria-expanded', 'false')
  await bottom.hover()
  await page.getByRole('button', { name: '固定画布工具栏', exact: true }).click()
  await page.getByRole('button', { name: '自动收起文档标签', exact: true }).click()
  await page.mouse.move(20, 200)
  await page.keyboard.press('Escape')
  await expect(top).toHaveAttribute('aria-expanded', 'false')
  await expect(bottom).toHaveAttribute('aria-expanded', 'true')
  await page.reload()
  await expect(bottom).toHaveAttribute('aria-expanded', 'true')
  await expect(top).toHaveAttribute('aria-expanded', 'false')
})

test('quick blank creation focuses the new title and keeps the original document open', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: '返回首页', exact: true }).click()
  await page.getByRole('button', { name: '空白导图', exact: true }).click()
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused({ timeout: 15_000 })
  await page.keyboard.insertText('新的空白导图')
  await page.keyboard.press('Tab')
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('第一个想法')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('topic-root')).toContainText('新的空白导图')
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '展开导图标签栏', exact: true })).toContainText(
    '2 份导图',
  )
})

test('context style copy and paste changes the target appearance and undoes once', async ({
  page,
}) => {
  await open(page)
  const source = page.getByTestId('topic-a')
  const target = page.getByTestId('topic-other')
  const fill = async (id: string) =>
    page
      .getByTestId(id)
      .evaluate((element) => getComputedStyle(element).getPropertyValue('--topic-fill'))
  const original = await fill('topic-other')
  const copied = await fill('topic-a')
  expect(copied).not.toBe(original)
  await source.click({ button: 'right' })
  await page.getByText('复制与应用样式', { exact: true }).hover()
  await page.getByRole('menuitem', { name: '复制主题样式', exact: true }).click()
  await target.click({ button: 'right' })
  await page.getByText('复制与应用样式', { exact: true }).hover()
  await page.getByRole('menuitem', { name: '粘贴样式到选中主题（1）', exact: true }).click()
  await expect.poll(() => fill('topic-other')).toBe(copied)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => fill('topic-other')).toBe(original)
})
