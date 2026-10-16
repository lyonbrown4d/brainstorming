import { expect, type Page } from '@playwright/test'

/** Enter the public example action only after startup has settled on an empty home. */
export async function enterExampleIfHome(page: Page): Promise<void> {
  const example = page.getByRole('button', { name: '探索示例', exact: true })
  await expect
    .poll(
      async () =>
        (await page.getByTestId('topic-root').isVisible()) ||
        ((await example.isVisible()) && (await example.isEnabled())),
    )
    .toBe(true)
  if (await example.isVisible()) await example.click()
  await expect(page.getByTestId('topic-root')).toBeVisible()
}

export async function openExample(page: Page): Promise<void> {
  await page.goto('/')
  await enterExampleIfHome(page)
}

/** Preserve the explicit blank-document fixture name used by existing editing workflows. */
export async function completeDocumentCreation(page: Page, title = '新的想法'): Promise<void> {
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill(title)
  await page.getByRole('button', { name: '创建文档', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText(title)
}
