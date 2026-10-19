import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 900, height: 600 },
  { width: 640, height: 760 },
])
  test(`export actions remain visible at ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto(
      `/iframe.html?id=${encodeURIComponent('brainstorming-图片导出--preview')}&viewMode=story`,
    )
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('img')).toBeVisible()
    const action = dialog.getByRole('button', { name: '导出文件', exact: true })
    await expect(action).toBeEnabled()
    const bounds = await action.boundingBox()
    expect(bounds).not.toBeNull()
    expect((bounds?.y ?? Infinity) + (bounds?.height ?? 0)).toBeLessThan(viewport.height - 8)
    expect(bounds?.y).toBeGreaterThan(0)
    await expect(dialog.getByRole('heading', { name: '导出导图' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    )
    await action.click()
    await expect(dialog.getByRole('status')).toContainText('.png')
  })
