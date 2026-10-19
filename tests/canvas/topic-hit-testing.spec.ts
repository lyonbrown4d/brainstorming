import { expect, test, type Locator, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const edge = (page: Page, id: string) => page.locator(`.react-flow__edge[data-id="edge-${id}"]`)
const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Missing topic geometry')
  return box
}
const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-canvas-drag--off-center-grab&viewMode=story')
  await expect(node(page, 'source')).toBeVisible()
  await expect(node(page, 'target')).toBeVisible()
}
const grabTitle = async (page: Page) => {
  await node(page, 'source').click()
  const box = await bounds(node(page, 'source').locator('.topic-title'))
  const point = { x: box.x + box.width - 22, y: box.y + box.height / 2 }
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  // React Flow starts its gesture after the configured four-pixel drag threshold.
  await page.mouse.move(point.x + 5, point.y)
  return { x: point.x + 5, y: point.y }
}

test('off-center title grab targets the actual pointer, commits one reparent and undoes it', async ({
  page,
}) => {
  await open(page)
  await grabTitle(page)
  const source = await bounds(node(page, 'source'))
  const target = await bounds(node(page, 'target'))
  // The pointer is inside the target while the dragged topic center is outside its left edge.
  await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 16 })
  await expect(page.getByTestId('drop-preview')).toHaveAttribute('data-parent-id', 'target')
  await expect(page.getByTestId('drop-preview')).toHaveAttribute('data-drop-mode', 'child')
  await expect(edge(page, 'source')).toHaveAttribute('aria-label', 'Edge from root to source')
  await page.mouse.up()
  await expect(edge(page, 'source')).toHaveAttribute('aria-label', 'Edge from target to source')
  await expect(edge(page, 'child')).toHaveAttribute('aria-label', 'Edge from source to child')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(edge(page, 'source')).toHaveAttribute('aria-label', 'Edge from root to source')
  await expect.poll(async () => (await bounds(node(page, 'source'))).x).toBeCloseTo(source.x, 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(edge(page, 'source')).toHaveAttribute('aria-label', 'Edge from target to source')
})

test('empty-space release preserves the pointer delta and hierarchy; cancellation adds no history', async ({
  page,
}) => {
  await open(page)
  const source = await bounds(node(page, 'source'))
  const child = await bounds(node(page, 'child'))
  const from = await grabTitle(page)
  const delta = { x: -65, y: 145 }
  await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps: 12 })
  await expect(page.getByTestId('drop-preview')).toHaveCount(0)
  await expect(page.getByTestId('drag-feedback')).toContainText('松开保留位置')
  await page.mouse.up()
  for (const [id, before] of [
    ['source', source],
    ['child', child],
  ] as const) {
    await expect
      .poll(async () => (await bounds(node(page, id))).x)
      .toBeCloseTo(before.x + delta.x, 0)
    await expect
      .poll(async () => (await bounds(node(page, id))).y)
      .toBeCloseTo(before.y + delta.y, 0)
  }
  await expect(edge(page, 'source')).toHaveAttribute('aria-label', 'Edge from root to source')
  const target = await bounds(node(page, 'target'))
  await grabTitle(page)
  await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 12 })
  await expect(page.getByTestId('drop-preview')).toHaveAttribute('data-parent-id', 'target')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByTestId('drop-preview')).toHaveCount(0)
  await expect
    .poll(async () => (await bounds(node(page, 'source'))).x)
    .toBeCloseTo(source.x + delta.x, 0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(node(page, 'source'))).x).toBeCloseTo(source.x, 0)
  await expect.poll(async () => (await bounds(node(page, 'source'))).y).toBeCloseTo(source.y, 0)
  await expect(edge(page, 'child')).toHaveAttribute('aria-label', 'Edge from source to child')
})
