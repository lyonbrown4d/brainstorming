import { expect, test, type Locator, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const bounds = async (element: Locator) => {
  const box = await element.boundingBox()
  if (!box) throw new Error('Missing spatial canvas geometry')
  return box
}
const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-空间视图--interactive&viewMode=story')
  await expect(page.locator('[data-view-mode="3d"]')).toBeVisible()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await expect(node(page, 'branch-a')).toBeVisible()
}
const drag = async (page: Page, handle: Locator, dx: number, dy: number) => {
  const box = await bounds(handle)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  await page.mouse.up()
}

const corners = [
  { name: 'top-left', dx: -65, dy: -35 },
  { name: 'top-right', dx: 65, dy: -35 },
  { name: 'bottom-left', dx: -65, dy: 35 },
  { name: 'bottom-right', dx: 65, dy: 35 },
] as const

for (const corner of corners) {
  test(`3D ${corner.name} grip scales the topic and one undo restores it`, async ({ page }) => {
    await open(page)
    const card = node(page, 'branch-a')
    await card.click()
    const before = await bounds(card)
    await drag(page, card.locator(`.topic-scale-${corner.name}`), corner.dx, corner.dy)
    await expect.poll(async () => (await bounds(card)).width).toBeGreaterThan(before.width + 25)
    const after = await bounds(card)
    expect(after.height / before.height, `${corner.name} aspect ratio`).toBeCloseTo(
      after.width / before.width,
      1,
    )
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await bounds(card)).width).toBeCloseTo(before.width, 0)
    await expect.poll(async () => (await bounds(card)).height).toBeCloseTo(before.height, 0)
  })
}

const emptyPanePoint = async (page: Page): Promise<{ x: number; y: number }> =>
  page.locator('.react-flow__pane').evaluate((pane) => {
    const rect = pane.getBoundingClientRect()
    for (const y of [0.75, 0.65, 0.45, 0.3])
      for (const x of [0.08, 0.18, 0.82, 0.92]) {
        const point = { x: rect.left + rect.width * x, y: rect.top + rect.height * y }
        if (document.elementFromPoint(point.x, point.y) === pane) return point
      }
    throw new Error('No exposed empty 3D canvas for the camera gesture')
  })

const angleDrag = async (
  page: Page,
  point: { x: number; y: number },
  dx: number,
  dy: number,
  cancel = false,
) => {
  await page.keyboard.down('Alt')
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 12 })
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.keyboard.up('Alt')
}

test('Alt drag on empty canvas changes the 3D angle once; Escape cancels the next preview', async ({
  page,
}) => {
  await open(page)
  const card = node(page, 'branch-a')
  const before = await bounds(card)
  const point = await emptyPanePoint(page)
  await angleDrag(page, point, 120, 70)
  await expect
    .poll(async () => {
      const changed = await bounds(card)
      return Math.hypot(changed.x - before.x, changed.y - before.y)
    })
    .toBeGreaterThan(8)
  const changed = await bounds(card)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(card)).x).toBeCloseTo(before.x, 0)
  await expect.poll(async () => (await bounds(card)).y).toBeCloseTo(before.y, 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await bounds(card)).x).toBeCloseTo(changed.x, 0)

  await angleDrag(page, point, -70, -50, true)
  await expect.poll(async () => (await bounds(card)).x).toBeCloseTo(changed.x, 0)
  await expect.poll(async () => (await bounds(card)).y).toBeCloseTo(changed.y, 0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(card)).x).toBeCloseTo(before.x, 0)
  await expect.poll(async () => (await bounds(card)).y).toBeCloseTo(before.y, 0)
})
