import { expect, test } from '@playwright/test'

// Embedded WDIO 1.5 emits MouseEvent only. Real PointerEvent/capture and browser
// hit testing need Playwright's actual mouse, not synthetic dispatchEvent clicks.
test('draws, cancels, erases and undoes with the real canvas pointer target', async ({ page }) => {
  await page.goto(
    `/iframe.html?id=${encodeURIComponent('brainstorming-画布自由绘图--select-and-move')}&viewMode=story`,
  )
  const paths = page.locator('[data-drawing-id]')
  await expect(paths).toHaveCount(1)
  const canvas = page.locator('.canvas')
  const box = await canvas.boundingBox()
  if (!box || box.height < 300) throw new Error('Preview must provide a usable canvas viewport')
  const x = box.x + box.width * 0.65
  const y = box.y + box.height * 0.65
  const dock = page.getByRole('button', { name: '展开浮动工具栏', exact: true })
  await dock.hover()
  await page.getByRole('button', { name: '自由绘图', exact: true }).click()
  await expect(page.locator('[data-canvas-ink]')).toBeVisible()
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 100, y - 40, { steps: 12 })
  await page.mouse.up()
  await expect(paths).toHaveCount(2)
  const lastId = await paths.last().getAttribute('data-drawing-id')
  if (!lastId) throw new Error('Created stroke must have a stable identifier')
  // A cancelled gesture does not create another history entry.
  await page.mouse.move(x, y + 80)
  await page.mouse.down()
  await page.mouse.move(x + 70, y + 40, { steps: 8 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(paths).toHaveCount(2)
  await expect(page.locator('[data-canvas-ink]')).toHaveCount(0)
  await dock.hover()
  await page.getByRole('button', { name: '擦除笔画', exact: true }).click()
  await page.mouse.click(x + 50, y - 20)
  await expect(paths).toHaveCount(1)
  await expect(page.locator(`[data-drawing-id="${lastId}"]`)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(paths).toHaveCount(2)
  await page.screenshot({ path: 'test-results/canvas/ink-real-pointer.png' })
})
