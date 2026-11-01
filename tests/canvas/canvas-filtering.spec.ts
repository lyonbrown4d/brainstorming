import { expect, test } from '@playwright/test'

test('filters the canvas through collapsed ancestors, exits without changing collapse or history', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=brainstorming-画布筛选--default&viewMode=story')
  const node = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
  await expect(node('other')).toBeVisible()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await page.getByRole('button', { name: '展开浮动工具栏', exact: true }).hover()
  await page.getByRole('button', { name: '主题筛选', exact: true }).click()
  await page.getByRole('combobox', { name: '画布显示' }).click()
  await page.getByRole('option', { name: '只显示匹配主题与祖先' }).click()
  await page.getByRole('combobox', { name: '筛选标签', exact: true }).click()
  await page.getByRole('option', { name: '重点', exact: true }).click()
  await expect(page.getByText('筛选中：1 个匹配主题，保留祖先路径')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(node('other')).toHaveCount(0)
  await expect(node('match')).toBeVisible()
  await expect(node('a')).toBeVisible()
  await page.screenshot({ path: 'test-results/canvas-filter.png' })
  await page.getByRole('button', { name: '退出筛选', exact: true }).click()
  await expect(node('other')).toBeVisible()
  await expect(node('match')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '撤销', exact: true, includeHidden: true }),
  ).toBeDisabled()
})
