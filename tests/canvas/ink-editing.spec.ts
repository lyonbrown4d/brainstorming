import { expect, test, type Locator, type Page } from '@playwright/test'

const open = async (page: Page): Promise<void> => {
  await page.goto(
    `/iframe.html?id=${encodeURIComponent('brainstorming-画布自由绘图--mixed-selection')}&viewMode=story`,
  )
  await expect(page.locator('[data-drawing-id="mixed-ink"]')).toBeVisible()
}
const box = async (locator: Locator) => {
  const value = await locator.boundingBox()
  if (!value) throw new Error('Missing canvas element geometry')
  return value
}
const drag = async (
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  threshold = 0,
): Promise<void> => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // React Flow starts its drag origin after the configured 4px threshold.
  if (threshold) await page.mouse.move(from.x + threshold, from.y)
  await page.mouse.move(from.x + threshold + dx, from.y + dy, { steps: 12 })
  await page.mouse.up()
}
const ink = (page: Page) => page.locator('.react-flow__node-ink')
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+z')
const redo = (page: Page) => page.keyboard.press('ControlOrMeta+Shift+z')

test('selects, moves and resizes ink with atomic undo/redo and cancellation', async ({ page }) => {
  await open(page)
  const path = page.locator('[data-drawing-id="mixed-ink"]')
  const before = await box(ink(page))
  await path.click()
  await expect(ink(page)).toHaveClass(/selected/)
  await expect(node(page, 'root')).not.toHaveClass(/selected/)
  await drag(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 }, 70, 40, 5)
  await expect.poll(async () => (await box(ink(page))).x).toBeCloseTo(before.x + 70, 0)
  await undo(page)
  await expect.poll(async () => (await box(ink(page))).x).toBeCloseTo(before.x, 0)
  await redo(page)
  const moved = await box(ink(page))
  const handle = ink(page).locator('.react-flow__resize-control.handle.bottom.right')
  await expect(handle).toBeVisible()
  const corner = await box(handle)
  await drag(page, { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 }, 90, 35)
  await expect.poll(async () => (await box(ink(page))).width).toBeGreaterThan(moved.width + 70)
  const resized = await box(ink(page))
  await undo(page)
  await expect.poll(async () => (await box(ink(page))).width).toBeCloseTo(moved.width, 0)
  await redo(page)
  await expect.poll(async () => (await box(ink(page))).width).toBeCloseTo(resized.width, 0)
  // Escape during a live resize restores the frame and adds no history entry.
  const again = await box(handle)
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2)
  await page.mouse.down()
  await page.mouse.move(again.x + 50, again.y + 30, { steps: 8 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(async () => (await box(ink(page))).width).toBeCloseTo(resized.width, 0)
  await undo(page)
  await expect.poll(async () => (await box(ink(page))).width).toBeCloseTo(moved.width, 0)
  const topLeft = await box(ink(page).locator('.react-flow__resize-control.handle.top.left'))
  await drag(
    page,
    { x: topLeft.x + topLeft.width / 2, y: topLeft.y + topLeft.height / 2 },
    -30,
    -20,
  )
  await expect.poll(async () => (await box(ink(page))).x).toBeCloseTo(moved.x - 30, 0)
  await expect.poll(async () => (await box(ink(page))).y).toBeCloseTo(moved.y - 20, 0)
  await undo(page)
  await expect.poll(async () => (await box(ink(page))).x).toBeCloseTo(moved.x, 0)
  await expect.poll(async () => (await box(ink(page))).width).toBeCloseTo(moved.width, 0)
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2)
  await page.mouse.down()
  await page.mouse.move(moved.x + moved.width / 2 + 50, moved.y + 30, { steps: 8 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(async () => (await box(ink(page))).x).toBeCloseTo(moved.x, 0)
  await undo(page)
  await expect.poll(async () => (await box(ink(page))).x).toBeCloseTo(before.x, 0)
})

test('marquee-selects ink and a connected topic, moves its subtree together and deletes with one undo', async ({
  page,
}) => {
  await open(page)
  const branch = await box(node(page, 'branch'))
  const child = await box(node(page, 'descendant'))
  const root = await box(node(page, 'root'))
  const stroke = await box(ink(page))
  const left = Math.min(branch.x, stroke.x) - 12,
    top = Math.min(branch.y, stroke.y) - 12
  const right = Math.max(branch.x + branch.width, stroke.x + stroke.width) + 12
  const bottom = Math.max(branch.y + branch.height, stroke.y + stroke.height) + 12
  await page.keyboard.down('Shift')
  await drag(page, { x: left, y: top }, right - left, bottom - top)
  await page.keyboard.up('Shift')
  await expect(node(page, 'branch')).toHaveClass(/selected/)
  await expect(ink(page)).toHaveClass(/selected/)
  await expect(node(page, 'root')).not.toHaveClass(/selected/)
  // Start in the group's empty interior, using React Flow's selection drag surface.
  await drag(
    page,
    { x: (left + right) / 2, y: (branch.y + branch.height + stroke.y) / 2 },
    60,
    35,
    5,
  )
  for (const [target, before] of [
    [node(page, 'branch'), branch],
    [node(page, 'descendant'), child],
    [ink(page), stroke],
  ] as const) {
    await expect.poll(async () => (await box(target)).x).toBeCloseTo(before.x + 60, 0)
    await expect.poll(async () => (await box(target)).y).toBeCloseTo(before.y + 35, 0)
  }
  await expect.poll(async () => (await box(node(page, 'root'))).x).toBeCloseTo(root.x, 0)
  await undo(page)
  await expect.poll(async () => (await box(node(page, 'branch'))).x).toBeCloseTo(branch.x, 0)
  await expect.poll(async () => (await box(ink(page))).x).toBeCloseTo(stroke.x, 0)
  await redo(page)
  await expect.poll(async () => (await box(ink(page))).x).toBeCloseTo(stroke.x + 60, 0)
  await page.keyboard.press('Delete')
  await expect(ink(page)).toHaveCount(0)
  await expect(node(page, 'branch')).toHaveCount(0)
  await expect(node(page, 'descendant')).toHaveCount(0)
  await expect(node(page, 'root')).toBeVisible()
  await undo(page)
  await expect(ink(page)).toHaveCount(1)
  await expect(node(page, 'branch')).toBeVisible()
  await expect(node(page, 'descendant')).toBeVisible()
  await page.screenshot({ path: 'test-results/canvas/ink-mixed-selection.png' })
})
