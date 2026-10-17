import type { Page } from '@playwright/test'

/** Reveal the same accessible Dock handle users use, including reduced-motion runs. */
export const openDock = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: '展开浮动工具栏', exact: true }).hover()
}
export const dockAction = async (page: Page, label: string): Promise<void> => {
  await openDock(page)
  await page.getByRole('button', { name: label, exact: true }).click()
}
