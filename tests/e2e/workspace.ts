import { reloadWindow } from '@tests/electron/session'
import { expect, type Page } from '@playwright/test'

/** Enter the example only after the real desktop home is ready. */
export const enterExampleIfHome = async (page: Page): Promise<void> => {
  const example = page.getByRole('button', { name: '探索示例', exact: true })
  await expect
    .poll(
      async () =>
        (await page.getByTestId('topic-root').isVisible()) ||
        ((await example.isVisible()) && (await example.isEnabled())),
      { timeout: 15_000 },
    )
    .toBe(true)
  if (await example.isVisible()) await example.click()
  await expect(page.getByTestId('topic-root')).toBeVisible()
}

export const openExample = async (page: Page): Promise<void> => {
  await reloadWindow(page)
  await enterExampleIfHome(page)
}

/** Preserve the explicit blank-document fixture name used by existing editing workflows. */
export const completeDocumentCreation = async (page: Page, title = '新的想法'): Promise<void> => {
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill(title)
  await page.getByRole('button', { name: '创建文档', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText(title)
}
