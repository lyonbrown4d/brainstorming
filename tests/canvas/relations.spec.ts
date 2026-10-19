import { expect, test, type Page, type Locator } from '@playwright/test'

const open = async (page: Page, route = 'curve') => {
  await page.goto(
    `/iframe.html?id=${encodeURIComponent(`brainstorming-关联线路径--${route}`)}&viewMode=story`,
  )
  await expect(page.locator('#relation-editable')).toHaveCount(1)
}
const center = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Missing relation control')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const move = async (page: Page, target: Locator, dx: number, dy: number, cancel = false) => {
  const before = cancel ? await pathValue(page) : null
  const point = await center(target)
  if (!(await target.getAttribute('data-testid'))) {
    const bounds = await target.boundingBox()
    if (bounds) point.x = bounds.x + 8
  }
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 12 })
  if (cancel) {
    // Prove Escape cancels an active gesture, rather than simply clearing the selection.
    await expect(path(page)).not.toHaveAttribute('d', before ?? '')
    await page.keyboard.press('Escape')
  }
  await page.mouse.up()
}
const path = (page: Page) => page.locator('#relation-editable')
const pathValue = async (page: Page): Promise<string> => {
  const value = await path(page).getAttribute('d')
  if (!value) throw new Error('Missing relation path')
  return value
}
const control = (page: Page) => page.getByTestId('relation-control-editable-0')
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+z')
const redo = (page: Page) => page.keyboard.press('ControlOrMeta+Shift+z')

for (const route of ['curve', 'orthogonal'])
  test(`${route}: path and label drags commit once; Escape cancels`, async ({ page }) => {
    await open(page, route)
    const before = await pathValue(page)
    await expect(control(page)).toBeVisible()
    await move(page, control(page), 70, -65)
    await expect(path(page)).not.toHaveAttribute('d', before)
    const edited = await pathValue(page)
    await undo(page)
    await expect(path(page)).toHaveAttribute('d', before)
    await redo(page)
    await expect(path(page)).toHaveAttribute('d', edited)
    await move(page, control(page), 40, 35, true)
    await expect(control(page)).toBeVisible()
    await expect(path(page)).toHaveAttribute('d', edited)
    const label = page.getByRole('button', { name: '关联线：拖动标签', exact: true })
    const original = await center(label)
    await move(page, label, 80, 45)
    await expect.poll(async () => (await center(label)).x).toBeCloseTo(original.x + 80, 0)
    await undo(page)
    await expect.poll(async () => (await center(label)).x).toBeCloseTo(original.x, 0)
    const outside = await center(control(page))
    await page.mouse.move(outside.x, outside.y)
    await page.mouse.down()
    await page.mouse.move(5, 5, { steps: 12 })
    await page.mouse.up()
    await expect(path(page)).toHaveAttribute('d', edited)
    await undo(page)
    await expect(path(page)).toHaveAttribute('d', before)
  })

test('creates from node handles, reconnects endpoints, and leaves tree edges intact', async ({
  page,
}) => {
  await open(page)
  const relations = page.locator('.react-flow__edge-relation')
  const structuralCount = await page
    .locator('.react-flow__edge:not(.react-flow__edge-relation)')
    .count()
  const source = page.locator(
    '.react-flow__node[data-id="a"] .source[data-handleid="source-bottom"]',
  )
  const target = page.locator('.react-flow__node[data-id="c"] .source[data-handleid="source-left"]')
  await page.locator('[data-testid="topic-a"]').hover()
  const start = await center(source),
    end = await center(target)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 20 })
  await page.mouse.up()
  await expect(relations).toHaveCount(2)
  await undo(page)
  await expect(relations).toHaveCount(1)
  await page.getByRole('button', { name: '关联线：拖动标签', exact: true }).click()
  const updater = page.locator('.react-flow__edgeupdater-target')
  const from = await center(updater)
  const before = await pathValue(page)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 20 })
  await page.mouse.up()
  await expect(path(page)).not.toHaveAttribute('d', before)
  await expect(page.locator('.react-flow__edge:not(.react-flow__edge-relation)')).toHaveCount(
    structuralCount,
  )
  await undo(page)
  await expect(path(page)).toHaveAttribute('d', before)
})
