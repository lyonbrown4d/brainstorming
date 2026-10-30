import { expect, test, type Locator, type Page } from '@playwright/test'

const topic = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Missing visible topic geometry')
  return box
}
const openCanvas = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-画布自由绘图--mixed-selection&viewMode=story')
  await expect(topic(page, 'branch')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0, { timeout: 15_000 })
}
const blankPoint = async (page: Page) => {
  const pane = await bounds(page.locator('.react-flow__pane'))
  for (const fy of [0.12, 0.88, 0.2, 0.8])
    for (const fx of [0.12, 0.88, 0.2, 0.8]) {
      const point = { x: pane.x + pane.width * fx, y: pane.y + pane.height * fy }
      if (
        await page.evaluate(
          (candidate) =>
            document.elementFromPoint(candidate.x, candidate.y)?.closest('.react-flow__pane') !==
            null,
          point,
        )
      )
        return point
    }
  throw new Error('Could not find an exposed blank canvas point')
}
const dragPan = async (
  page: Page,
  point: { x: number; y: number },
  button: 'middle' | 'left',
  space = false,
) => {
  if (space) await page.keyboard.down('Space')
  try {
    await page.mouse.move(point.x, point.y)
    await page.mouse.down({ button })
    await page.mouse.move(point.x + 90, point.y + 55, { steps: 8 })
    await page.mouse.up({ button })
  } finally {
    if (space) await page.keyboard.up('Space')
  }
}

test('wheel scroll pans both axes, while modifier wheel zooms at the pointer', async ({ page }) => {
  await openCanvas(page)
  const point = await blankPoint(page)
  const before = await bounds(topic(page, 'branch')),
    pageScale = await page.evaluate(() => window.devicePixelRatio)
  await page.mouse.move(point.x, point.y)
  await page.mouse.wheel(80, 65)
  await expect
    .poll(async () => {
      const next = await bounds(topic(page, 'branch'))
      return Math.hypot(next.x - before.x, next.y - before.y)
    })
    .toBeGreaterThan(20)
  const panned = await bounds(topic(page, 'branch'))
  expect(Math.abs(panned.width - before.width)).toBeLessThan(1)

  await page.keyboard.down('ControlOrMeta')
  try {
    await page.mouse.wheel(0, -80)
  } finally {
    await page.keyboard.up('ControlOrMeta')
  }
  await expect
    .poll(async () => (await bounds(topic(page, 'branch'))).width)
    .toBeGreaterThan(panned.width + 5)
  const zoomed = await bounds(topic(page, 'branch'))
  expect(zoomed.x).toBeCloseTo(point.x + (panned.x - point.x) * (zoomed.width / panned.width), 0)
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(pageScale)
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0)
})

test('middle button and Space plus primary drag pan without moving topics', async ({ page }) => {
  await openCanvas(page)
  const point = await blankPoint(page)
  const original = await bounds(topic(page, 'branch'))
  await dragPan(page, point, 'middle')
  await expect
    .poll(async () => {
      const next = await bounds(topic(page, 'branch'))
      return Math.hypot(next.x - original.x, next.y - original.y)
    })
    .toBeGreaterThan(20)
  const middlePanned = await bounds(topic(page, 'branch'))
  await dragPan(page, await blankPoint(page), 'left', true)
  await expect
    .poll(async () => {
      const next = await bounds(topic(page, 'branch'))
      return Math.hypot(next.x - middlePanned.x, next.y - middlePanned.y)
    })
    .toBeGreaterThan(20)
  expect(Math.abs((await bounds(topic(page, 'branch'))).width - original.width)).toBeLessThan(1)
})
