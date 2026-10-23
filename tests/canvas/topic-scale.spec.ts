import { expect, test, type Locator, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const bounds = async (element: Locator) => {
  const box = await element.boundingBox()
  if (!box) throw new Error('Missing canvas geometry')
  return box
}
const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-交互调整--standard&viewMode=story')
  await expect(node(page, 'detail')).toBeVisible()
  await node(page, 'a').click()
}
const drag = async (page: Page, handle: Locator, dx: number, dy: number, cancel = false) => {
  const box = await bounds(handle)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 })
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up()
}

test('scale grips appear only on the selected topic', async ({ page }) => {
  await open(page)
  await expect(node(page, 'a').locator('.topic-scale-control')).toHaveCount(4)
  await expect(node(page, 'b').locator('.topic-scale-control')).toHaveCount(0)
  await node(page, 'b').click()
  await expect(node(page, 'a').locator('.topic-scale-control')).toHaveCount(0)
  await expect(node(page, 'b').locator('.topic-scale-control')).toHaveCount(4)
})

test('overview zoom leaves the selected topic body draggable and restores grips when zoomed in', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  const card = node(page, 'a')
  const smaller = page.getByRole('button', { name: '缩小', exact: true })
  for (let step = 0; step < 12; step++) await smaller.click()
  await expect.poll(async () => (await bounds(card)).height).toBeLessThan(28)
  await expect(card.locator('.topic-scale-control')).toHaveCount(0)
  const box = await bounds(card)
  const hit = await page.evaluate(
    ({ x, y }) => {
      const hit = document.elementFromPoint(x, y)
      return (
        hit?.closest('.react-flow__node')?.getAttribute('data-id') === 'a' &&
        !hit.closest('.nodrag')
      )
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  )
  expect(hit).toBe(true)
  const larger = page.getByRole('button', { name: '放大', exact: true })
  for (let step = 0; step < 12; step++) await larger.click()
  await expect(card.locator('.topic-scale-control')).toHaveCount(4)
})

const corners = [
  { name: 'top-left', dx: -65, dy: -35 },
  { name: 'top-right', dx: 65, dy: -35 },
  { name: 'bottom-left', dx: -65, dy: 35 },
  { name: 'bottom-right', dx: 65, dy: 35 },
] as const

for (const corner of corners) {
  test(`${corner.name} scales the full topic around its opposite corner`, async ({ page }) => {
    await open(page)
    const card = node(page, 'a')
    const handle = card.locator(`.topic-scale-${corner.name}`)
    const original = await bounds(card)
    const title = card.locator('.topic-title')
    const originalTitle = await bounds(title)
    await drag(page, handle, corner.dx, corner.dy)
    const scaled = await bounds(card)
    const scaledTitle = await bounds(title)
    expect(scaled.width).toBeGreaterThan(original.width + 35)
    expect(scaled.height / original.height).toBeCloseTo(scaled.width / original.width, 1)
    expect(scaledTitle.height / originalTitle.height).toBeCloseTo(scaled.width / original.width, 1)
    const fixedX = corner.name.endsWith('left')
      ? original.x + original.width - scaled.width
      : original.x
    const fixedY = corner.name.startsWith('top')
      ? original.y + original.height - scaled.height
      : original.y
    expect(scaled.x).toBeCloseTo(fixedX, 0)
    expect(scaled.y).toBeCloseTo(fixedY, 0)
    await drag(page, handle, corner.dx / 2, corner.dy / 2, true)
    await expect.poll(async () => (await bounds(card)).width).toBeCloseTo(scaled.width, 0)
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await bounds(card)).width).toBeCloseTo(original.width, 0)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(async () => (await bounds(card)).width).toBeCloseTo(scaled.width, 0)
  })
}

test('percentage and reset preserve the base width control', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '属性面板', exact: true }).click()
  const card = node(page, 'a')
  const original = await bounds(card)
  const width = page.getByRole('spinbutton', { name: '主题宽度', exact: true })
  const baseWidth = Number(await width.inputValue())
  const scale = page.getByRole('spinbutton', { name: '主题缩放', exact: true })
  await scale.fill('150')
  await scale.press('Enter')
  await expect(scale).toHaveValue('150')
  await expect.poll(async () => (await bounds(card)).width).toBeCloseTo(original.width * 1.5, 0)
  await expect(width).toHaveValue(String(baseWidth))
  await page.getByRole('button', { name: '重置为 100%', exact: true }).click()
  await expect(scale).toHaveValue('100')
  await expect.poll(async () => (await bounds(card)).width).toBeCloseTo(original.width, 0)
})
