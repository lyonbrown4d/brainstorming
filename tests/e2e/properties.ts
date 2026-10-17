import { expect, type Page } from '@playwright/test'

export const openProperties = async (page: Page, mode: '主题' | '画布') => {
  const panel = page.getByRole('complementary', { name: '属性面板', exact: true })
  if (!(await panel.isVisible()))
    await page.getByRole('button', { name: '属性面板', exact: true }).click()
  await panel
    .getByRole('tablist', { name: '属性类别', exact: true })
    .getByRole('tab', { name: mode, exact: true })
    .click()
  await expect(
    panel
      .getByRole('tablist', { name: '属性类别', exact: true })
      .getByRole('tab', { name: mode, exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  return panel
}
export const canvasProperties = async (page: Page, section: '结构' | '配色' | '模板' = '配色') => {
  const panel = await openProperties(page, '画布')
  await panel
    .getByRole('tablist', { name: '画布设置', exact: true })
    .getByRole('tab', { name: section, exact: true })
    .click()
  return panel
}
export const topicProperties = async (page: Page) => openProperties(page, '主题')
