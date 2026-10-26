import { expect, test, type Locator, type Page } from '@playwright/test'
import type { DenseEdgeGpuCanvas } from '@renderer/lib/denseEdgeGpuTypes'

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

const denseSource = (page: Page) =>
  page.evaluate(() => {
    const id = 'edge-topic-1'
    const gpu = document.querySelector<DenseEdgeGpuCanvas>(
      '[data-gpu-edge-active="true"] canvas[data-gpu-edge-ready="true"]',
    )
    const source = gpu?.edgeDiagnostics?.source(id)
    if (source) return source
    const paths = document.querySelectorAll<SVGPathElement>(
      '[data-testid="structural-edge-layer"] path.react-flow__edge-path',
    )
    for (const path of paths) {
      const direct = path.closest('[data-id]')?.getAttribute('data-id') === id
      const ids: unknown = JSON.parse(path.getAttribute('data-structural-edge-ids') ?? '[]')
      const index = Array.isArray(ids) ? ids.indexOf(id) : -1
      if (!direct && index < 0) continue
      const curve = path.cloneNode() as SVGPathElement
      if (!direct) curve.setAttribute('d', path.getAttribute('d')?.match(/M[^M]*/g)?.[index] ?? '')
      const point = curve.getPointAtLength(0)
      const matrix = path.getScreenCTM()
      if (!matrix) throw new Error('Dense curve has no viewport transform')
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
      return { x: screen.x, y: screen.y }
    }
    throw new Error('Root structural edge is missing')
  })

test('thousand-topic root translation keeps dense edges attached during move, cancel and undo', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(
    '/iframe.html?id=brainstorming-canvas-performance--thousand-topics&viewMode=story',
  )
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await page.getByRole('button', { name: '聚焦选中主题', exact: true }).click()
  const root = page.locator('.react-flow__node[data-id="root"]')
  await expect(root).toBeVisible()
  const gpu = process.env.BRAINSTORMING_EXPECT_GPU === '1'
  await expect(page.locator('canvas[data-gpu-edge-ready="true"]')).toHaveCount(gpu ? 1 : 0)
  // Capture coordinates only after focus navigation settles and the topic accepts real input.
  await root.click({ trial: true })
  const before = await bounds(root)
  const start = { x: before.x + before.width / 2, y: before.y + before.height / 2 }
  const check = async () => {
    await expect.poll(async () => handleDistance(root, await denseSource(page))).toBeLessThan(4)
  }
  await check()
  for (const cancel of [true, false]) {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 5, start.y)
    await page.mouse.move(start.x + 95, start.y + 60, { steps: 12 })
    await expect.poll(async () => (await bounds(root)).x).toBeGreaterThan(before.x + 70)
    await check()
    await page.screenshot({ path: 'test-results/canvas/gpu-dense-root-drag.png' })
    if (cancel) await page.keyboard.press('Escape')
    await page.mouse.up()
    if (!cancel) {
      await check()
      await page.keyboard.press('ControlOrMeta+z')
    }
    await expect.poll(async () => (await bounds(root)).x).toBeCloseTo(before.x, 0)
    await check()
  }
  if (!gpu) return
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 45, start.y + 25, { steps: 8 })
  await expect(page.locator('[data-gpu-edge-active="true"] canvas')).toBeVisible()
  await page.locator('canvas[data-gpu-edge-ready="true"]').evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext('webgl2')
    const extension = context?.getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('GPU context loss cannot be verified')
    extension.loseContext()
  })
  await expect(page.locator('svg[data-structural-edge-renderer="dense"]')).toBeVisible()
  await check()
  await page.keyboard.press('Escape')
  await page.mouse.up()
})
