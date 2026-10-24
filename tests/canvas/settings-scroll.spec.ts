import { expect, test } from '@playwright/test'

for (const surface of ['settings', 'help'] as const) {
  test(`${surface}: shortcuts remain scrollable with search and recording available in a short window`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 760, height: 420 })
    await page.goto('/iframe.html?id=brainstorming-画布自由绘图--mixed-selection&viewMode=story')
    await expect(page.locator('.react-flow__node[data-id="branch"]')).toBeVisible()
    if (surface === 'settings') await page.keyboard.press('ControlOrMeta+,')
    else await page.getByRole('button', { name: '键盘快捷键', exact: true }).click()

    const settings = page.getByRole('dialog', {
      name: surface === 'settings' ? '应用设置' : '键盘快捷键',
      exact: true,
    })
    await expect(settings).toBeVisible()
    if (surface === 'settings')
      await settings.getByRole('tab', { name: '快捷键', exact: true }).click()

    const search = settings.getByRole('textbox', { name: '搜索快捷键' })
    const viewport = settings.locator('[data-slot="scroll-area-viewport"]')
    const lastRow = settings.locator('section').last().locator('.divide-y > div').last()
    const searchBefore = await search.boundingBox()
    if (!searchBefore) throw new Error('Missing shortcut search geometry')
    await viewport.hover()
    await page.mouse.wheel(0, 2400)
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

    const viewportBox = await viewport.boundingBox()
    const lastRowBox = await lastRow.boundingBox()
    const searchAfter = await search.boundingBox()
    if (!viewportBox || !lastRowBox || !searchAfter) throw new Error('Missing settings geometry')
    expect(lastRowBox.y).toBeGreaterThanOrEqual(viewportBox.y)
    expect(lastRowBox.y + lastRowBox.height).toBeLessThanOrEqual(
      viewportBox.y + viewportBox.height + 1,
    )
    expect(searchAfter.y).toBeCloseTo(searchBefore.y, 0)
    await expect(search).toBeVisible()
    await page.screenshot({ path: 'test-results/canvas/settings-short-window.png' })

    const record = settings
      .locator('section')
      .last()
      .getByRole('button', { name: /录制快捷键/ })
      .first()
    await record.click()
    await expect(record).toBeFocused()
    await expect(record).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await expect(settings).toBeVisible()
    await expect(record).toHaveAttribute('aria-pressed', 'false')
    await expect(record).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(settings).toHaveCount(0)
  })
}
