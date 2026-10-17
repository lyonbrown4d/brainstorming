import { expect, test } from '@playwright/test'
import { openExample } from '@tests/e2e/workspace'

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(`稳定 Dock 入口：${reducedMotion}`, () => {
    test.use({ reducedMotion })

    test('原生指针首次点击只展开工具，不触发指针下方的其他操作', async ({ page }) => {
      await openExample(page)
      const handle = page.getByRole('button', { name: '展开浮动工具栏', exact: true })
      const toolbar = page.getByRole('toolbar', { name: '导图操作', exact: true })
      await expect(handle).toHaveAttribute('aria-expanded', 'false')
      const before = await handle.boundingBox()
      if (!before) throw new Error('缺少 Dock 入口')
      const topicCount = await page.locator('[data-testid^="topic-"]').count()

      // Real pointer movement triggers hover before pointerdown, reproducing the original race.
      const x = before.x + before.width / 2
      const y = before.y + before.height / 2
      await page.mouse.move(x, y)
      await expect(handle).toHaveAttribute('aria-expanded', 'true')
      await page.mouse.down()
      await page.mouse.up()

      await expect(toolbar).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: /^编辑/ })).toHaveCount(0)
      await expect(page.locator('[data-testid^="topic-"]')).toHaveCount(topicCount)
      // The hover transition and completed reveal both retain the entry's exact geometry.
      await expect.poll(async () => (await handle.boundingBox())?.x).toBe(before.x)
      await expect.poll(async () => (await handle.boundingBox())?.y).toBe(before.y)
      await expect(handle).toHaveAttribute('aria-expanded', 'true')
    })
  })
}

test('Dock 离开后收起、重新移入可展开，Esc 把焦点留在稳定入口', async ({ page }) => {
  await openExample(page)
  const handle = page.getByRole('button', { name: '展开浮动工具栏', exact: true })
  await handle.hover()
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  await page.mouse.move(20, 200)
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
  await handle.hover()
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  await page.mouse.move(20, 200)
  await expect(handle).toHaveAttribute('aria-expanded', 'false')

  await page.keyboard.press('Tab')
  await handle.focus()
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Tab')
  const firstAction = page.getByRole('button', { name: '添加同级主题', exact: true })
  // Some Chromium versions focus the scroll viewport before its first action.
  if (!(await firstAction.evaluate((element) => element === document.activeElement))) {
    await page.keyboard.press('Tab')
  }
  await expect(firstAction).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(handle).toBeFocused()
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('toolbar', { name: '导图操作', exact: true })).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
})
