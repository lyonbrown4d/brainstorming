import { expect, type Page } from '@playwright/test'

export const openDocumentTabs = async (page: Page) => {
  await page.getByRole('button', { name: '展开导图标签栏', exact: true }).hover()
  const tabs = page.getByRole('tablist', { name: '打开的导图', exact: true })
  await expect(tabs).toBeVisible()
  return tabs
}

/** Remove the saved background map so the following open exercises native disk parsing. */
export const closeDocumentTab = async (page: Page, index = 0): Promise<void> => {
  const tabs = await openDocumentTabs(page)
  await tabs
    .getByRole('button', { name: /^关闭导图 / })
    .nth(index)
    .click()
}
