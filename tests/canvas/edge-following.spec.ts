import { expect, test, type Locator, type Page } from '@playwright/test'

const topic = (page: Page) => page.locator('.react-flow__node[data-id="descendant"]')
const edge = (page: Page) => page.locator('#edge-descendant')
const bounds = async (element: Locator) => {
  const box = await element.boundingBox()
  if (!box) throw new Error('Topic geometry is unavailable')
  return box
}
const endpoint = async (path: Locator) =>
  path.evaluate((element) => {
    const curve = element as SVGPathElement
    const point = curve.getPointAtLength(curve.getTotalLength())
    const transform = curve.getScreenCTM()
    if (!transform) throw new Error('Missing edge transform')
    const screen = new DOMPoint(point.x, point.y).matrixTransform(transform)
    return { x: screen.x, y: screen.y }
  })
const handleDistance = async (node: Locator, point: { x: number; y: number }) =>
  node.evaluate((element, end) => {
    const handles = [...element.querySelectorAll('[data-handleid^="source-"]')]
    return Math.min(
      ...handles.map((handle) => {
        const box = handle.getBoundingClientRect()
        const side = handle.getAttribute('data-handlepos')
        const x =
          side === 'left' ? box.x : side === 'right' ? box.x + box.width : box.x + box.width / 2
        const y =
          side === 'top' ? box.y : side === 'bottom' ? box.y + box.height : box.y + box.height / 2
        return Math.hypot(x - end.x, y - end.y)
      }),
    )
  }, point)

for (const variant of ['orthogonal', 'waypoints', 'sketch']) {
  test(`${variant}: structural edge follows the dragged title before release, cancel and undo`, async ({
    page,
  }) => {
    await page.goto(
      `/iframe.html?id=${encodeURIComponent(`brainstorming-实时结构连线--${variant}`)}&viewMode=story`,
    )
    await expect(topic(page)).toBeVisible()
    await topic(page).click()
    const box = await bounds(topic(page))
    const before = await edge(page).getAttribute('d')
    if (!before) throw new Error('Missing structural edge path')
    const start = { x: box.x + box.width / 2 + 8, y: box.y + box.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 5, start.y)
    // Stay beyond the magnetic attachment area, including the compact fishbone layout.
    await page.mouse.move(start.x + 235, start.y + 210, { steps: 12 })
    await expect(edge(page)).not.toHaveAttribute('d', before)
    await expect(page.getByTestId('drop-preview')).toHaveCount(0)
    await expect
      .poll(async () => handleDistance(topic(page), await endpoint(edge(page))))
      .toBeLessThan(4)
    const preview = await edge(page).getAttribute('d')
    await page.screenshot({ path: `test-results/canvas/live-edge-${variant}.png` })
    await page.mouse.up()
    await expect.poll(async () => (await bounds(topic(page))).x).toBeCloseTo(box.x + 230, 0)
    await expect
      .poll(async () => handleDistance(topic(page), await endpoint(edge(page))))
      .toBeLessThan(4)
    expect(preview).not.toBe(before)
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await bounds(topic(page))).x).toBeCloseTo(box.x, 0)
    await expect(edge(page)).toHaveAttribute('d', before)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 90, start.y + 100, { steps: 10 })
    await expect(edge(page)).not.toHaveAttribute('d', before)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(edge(page)).toHaveAttribute('d', before)
  })
}
