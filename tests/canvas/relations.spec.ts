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

const bodyPoint = async (page: Page) =>
  path(page).evaluate((element) => {
    if (!(element instanceof SVGPathElement)) throw new Error('Missing SVG relation path')
    const length = element.getTotalLength()
    const at = length * 0.25
    const point = element.getPointAtLength(at)
    const next = element.getPointAtLength(at + 1)
    const matrix = element.getScreenCTM()
    if (!matrix) throw new Error('Missing relation transform')
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
    const tangent = new DOMPoint(next.x, next.y).matrixTransform(matrix)
    const dx = tangent.x - screen.x,
      dy = tangent.y - screen.y
    const magnitude = Math.hypot(dx, dy)
    // Start six screen pixels off the thin visible line, within the interaction stroke.
    return { x: screen.x - (dy / magnitude) * 6, y: screen.y + (dx / magnitude) * 6 }
  })
const endpoints = async (page: Page) =>
  path(page).evaluate((element) => {
    if (!(element instanceof SVGPathElement)) throw new Error('Missing SVG relation path')
    const start = element.getPointAtLength(0),
      end = element.getPointAtLength(element.getTotalLength())
    return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } }
  })

for (const route of ['curve', 'orthogonal', 'straight'])
  test(`${route}: grabs an unselected line body through the wide hit area and keeps endpoints bound`, async ({
    page,
  }) => {
    await open(page, route)
    // Clear annotation selection through the canvas, independent of initial editor autofocus.
    await page.locator('.react-flow__pane').click({ position: { x: 24, y: 160 } })
    await expect(page.locator('.react-flow__edge-relation')).not.toHaveClass(/selected/u)
    await expect(control(page)).toHaveCount(0)
    const before = await pathValue(page)
    const bound = await endpoints(page)
    const nodes = page.locator('.react-flow__node')
    const transforms = await nodes.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('style')),
    )
    const point = await bodyPoint(page)
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await page.mouse.move(point.x + 45, point.y - 70, { steps: 12 })
    await expect(path(page)).not.toHaveAttribute('d', before)
    await expect(control(page)).toBeVisible()
    await page.mouse.up()
    const edited = await pathValue(page)
    expect(await endpoints(page)).toEqual(bound)
    expect(
      await nodes.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('style')),
      ),
    ).toEqual(transforms)
    await undo(page)
    await expect(path(page)).toHaveAttribute('d', before)
    await redo(page)
    await expect(path(page)).toHaveAttribute('d', edited)
    const cancelPoint = await bodyPoint(page)
    await page.mouse.move(cancelPoint.x, cancelPoint.y)
    await page.mouse.down()
    await page.mouse.move(cancelPoint.x + 35, cancelPoint.y + 45, { steps: 12 })
    await expect(path(page)).not.toHaveAttribute('d', edited)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(path(page)).toHaveAttribute('d', edited)
    await expect(control(page)).toBeVisible()
    await undo(page)
    await expect(path(page)).toHaveAttribute('d', before)
    // Editing a label still uses its text editor after a body drag.
    await page.getByRole('button', { name: '关联线：拖动标签', exact: true }).dblclick()
    const label = page.getByRole('textbox', { name: '编辑关联线名称', exact: true })
    await expect(label).toBeFocused()
    await page.keyboard.press('Escape')
  })
