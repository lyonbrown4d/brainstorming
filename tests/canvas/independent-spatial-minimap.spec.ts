import { expect, test } from '@playwright/test'
import {
  locatorBounds,
  openSpatial,
  settledSpatialRect,
  spatialEvidence,
  spatialRect,
} from '@tests/canvas/spatial-test-geometry'

test('independent 3D minimap pans, zooms and reopens with real input without changing topics', async ({
  page,
}) => {
  await openSpatial(page)
  const minimap = page.locator('canvas[data-spatial-minimap]')
  const mask = page.locator('[data-spatial-minimap-mask]')
  if (!(await minimap.isVisible()))
    await page.getByRole('button', { name: '显示缩略图', exact: true }).click()
  await expect(mask).toHaveAttribute('d', /M0,0/)
  const original = (await spatialEvidence(page)).document
  const before = await settledSpatialRect(page, 'root')
  const box = await locatorBounds(minimap)
  const maskBefore = await mask.getAttribute('d')
  const bitmap = await minimap.evaluate((element) => (element as HTMLCanvasElement).toDataURL())
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.45 + 12, box.y + box.height * 0.55 + 8, { steps: 12 })
  await expect(mask).not.toHaveAttribute('d', maskBefore ?? '')
  expect(await minimap.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(
    bitmap,
  )
  await page.mouse.up()
  await expect.poll(async () => (await spatialRect(page, 'root')).x).toBeLessThan(before.x - 30)
  const panned = await settledSpatialRect(page, 'root')
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  for (let index = 0; index < 3; index++) await page.mouse.wheel(0, -20)
  await expect
    .poll(async () => (await spatialRect(page, 'root')).width)
    .toBeGreaterThan(panned.width * 1.3)
  await settledSpatialRect(page, 'root')
  await page.getByRole('button', { name: '关闭缩略图', exact: true }).click()
  await expect(minimap).toHaveCount(0)
  await page.getByRole('button', { name: '显示缩略图', exact: true }).click()
  await expect(mask).toHaveAttribute('d', /M0,0/)
  await page.getByRole('radio', { name: '二维视图', exact: true }).click()
  await expect(page.locator('.react-flow__minimap-svg')).toBeVisible()
  await page.getByRole('radio', { name: '三维视图', exact: true }).click()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await expect(mask).toHaveAttribute('d', /M0,0/)
  await expect(page.locator('.react-flow')).toHaveCount(0)
  expect((await spatialEvidence(page)).document.topics).toEqual(original.topics)
})
