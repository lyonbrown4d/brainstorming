import { cameraScale, exposedTopicPoint } from '@tests/canvas/spatial-test-geometry'
import { expect, test, type Locator, type Page } from '@playwright/test'

const story = '/iframe.html?id=brainstorming-空间视图--interactive&viewMode=story'
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const ink = (page: Page) => page.locator('.react-flow__node-ink')
const surface = (page: Page) => page.locator('.react-flow__pane')
const emptyPanePoint = async (page: Page): Promise<{ x: number; y: number }> =>
  surface(page).evaluate((pane) => {
    const rect = pane.getBoundingClientRect()
    for (const y of [0.72, 0.6, 0.42, 0.28])
      for (const x of [0.12, 0.2, 0.8, 0.88]) {
        const point = { x: rect.left + rect.width * x, y: rect.top + rect.height * y }
        if (document.elementFromPoint(point.x, point.y) === pane) return point
      }
    throw new Error('No exposed empty pane point for camera orbit')
  })
const box = async (locator: Locator) => {
  const value = await locator.boundingBox()
  if (!value) throw new Error('Missing spatial canvas geometry')
  return value
}
const settledBox = async (locator: Locator): Promise<void> => {
  let previous = await box(locator)
  let stable = 0
  await expect
    .poll(
      async () => {
        const current = await box(locator)
        stable = Math.hypot(current.x - previous.x, current.y - previous.y) < 0.05 ? stable + 1 : 0
        previous = current
        return stable
      },
      { intervals: [60, 60, 60, 60, 60], timeout: 5000 },
    )
    .toBeGreaterThanOrEqual(3)
}
const open = async (page: Page): Promise<void> => {
  await page.goto(story)
  await expect(page.locator('[data-view-mode="3d"]')).toBeVisible()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('[data-spatial-renderer] canvas')).toBeVisible()
  await expect(surface(page)).toHaveCount(1)
  await expect(node(page, 'branch-a')).toBeVisible()
}
const openCamera = async (page: Page): Promise<void> => {
  const preset = page.getByRole('button', { name: '等轴测', exact: true })
  if (!(await preset.isVisible()))
    await page.getByRole('button', { name: '视角', exact: true }).click()
  await expect(preset).toBeVisible()
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
  if (threshold) await page.mouse.move(from.x + threshold, from.y)
  await page.mouse.move(from.x + threshold + dx, from.y + dy, { steps: 12 })
  await page.mouse.up()
}

test('camera presets and angle slider preview save one undoable view change each', async ({
  page,
}) => {
  await open(page)
  const branch = node(page, 'branch-a')
  const original = await box(branch)
  await openCamera(page)
  const yaw = page.getByRole('slider').first()
  const pitch = page.getByRole('slider').nth(1)
  await expect(yaw).toHaveAttribute('aria-valuenow', '40')
  await expect(pitch).toHaveAttribute('aria-valuenow', '29')

  await page.getByRole('button', { name: '右侧', exact: true }).click()
  await expect(yaw).toHaveAttribute('aria-valuenow', '90')
  await expect(pitch).toHaveAttribute('aria-valuenow', '0')
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await openCamera(page)
  await expect(yaw).toHaveAttribute('aria-valuenow', '40')
  await expect(pitch).toHaveAttribute('aria-valuenow', '29')
  await expect.poll(async () => (await box(branch)).x).toBeCloseTo(original.x, 0)
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await openCamera(page)
  await expect(yaw).toHaveAttribute('aria-valuenow', '90')

  const thumb = await box(yaw)
  const rail = await box(page.locator('[data-slot="popover-content"] [data-slot="slider"]').first())
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)
  await page.mouse.down()
  await page.mouse.move(rail.x + rail.width * 0.55, thumb.y + thumb.height / 2, {
    steps: 8,
  })
  await expect(yaw).not.toHaveAttribute('aria-valuenow', '90')
  await page.mouse.up()
  const adjusted = await yaw.getAttribute('aria-valuenow')
  expect(adjusted).not.toBe('90')
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await openCamera(page)
  await expect(yaw).toHaveAttribute('aria-valuenow', '90')
})

test('direct blank-canvas orbit commits once, keeps selection, and Escape drops the next preview', async ({
  page,
}) => {
  await open(page)
  const branch = node(page, 'branch-a')
  await branch.click()
  const original = await box(branch)
  const point = await emptyPanePoint(page)

  await expect(surface(page)).toHaveCSS('pointer-events', 'auto')
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 140, point.y + 70, { steps: 12 })
  await expect(surface(page)).toHaveCSS('pointer-events', 'auto')
  await page.mouse.up()
  await expect
    .poll(async () => {
      const current = await box(branch)
      return Math.hypot(current.x - original.x, current.y - original.y)
    })
    .toBeGreaterThan(2)
  await openCamera(page)
  const orbitedYaw = await page.getByRole('slider').first().getAttribute('aria-valuenow')
  expect(orbitedYaw).not.toBe('40')
  await page.keyboard.press('Escape')
  await expect(branch).toHaveClass(/selected/)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await box(branch)).x).toBeCloseTo(original.x, 0)
  await expect.poll(async () => (await box(branch)).y).toBeCloseTo(original.y, 0)

  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x - 100, point.y - 65, { steps: 12 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(async () => (await box(branch)).x).toBeCloseTo(original.x, 0)
  await expect.poll(async () => (await box(branch)).y).toBeCloseTo(original.y, 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await openCamera(page)
  await expect(page.getByRole('slider').first()).toHaveAttribute('aria-valuenow', orbitedYaw ?? '')
})

test('side view preserves mixed topic and ink moves, title editing, resize, and zoom', async ({
  page,
}) => {
  await open(page)
  await openCamera(page)
  await page.getByRole('button', { name: '右侧', exact: true }).click()
  const branch = node(page, 'branch-a')
  const stroke = ink(page)
  await settledBox(branch)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  await expect(stroke).toBeVisible()
  await settledBox(branch)
  const firstClick = await exposedTopicPoint(branch)
  await page.mouse.click(firstClick.x, firstClick.y)
  await page.locator('[data-drawing-id="spatial-ink"]').click({ modifiers: ['Meta'] })
  await expect(branch).toHaveClass(/selected/)
  await expect(stroke).toHaveClass(/selected/)
  const before = { branch: await box(branch), stroke: await box(stroke) }
  const branchScale = await cameraScale(branch)
  const inkScale = await cameraScale(stroke)
  await drag(page, await exposedTopicPoint(branch), 65, 35, 5)
  await expect.poll(async () => (await box(branch)).x).toBeCloseTo(before.branch.x + 65, 0)
  await expect
    .poll(async () => (await box(stroke)).x)
    .toBeCloseTo(before.stroke.x + (65 * inkScale) / branchScale, 0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await box(branch)).x).toBeCloseTo(before.branch.x, 0)
  await expect.poll(async () => (await box(stroke)).x).toBeCloseTo(before.stroke.x, 0)

  const secondClick = await exposedTopicPoint(branch)
  await page.mouse.click(secondClick.x, secondClick.y)
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('侧视编辑')
  await page.keyboard.press('Enter')
  await expect(branch.locator('.topic-title')).toContainText('侧视编辑')
  const grip = branch.locator('.topic-scale-bottom-right')
  const gripBox = await box(grip)
  const width = (await box(branch)).width
  await drag(page, { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 }, 55, 25)
  await expect.poll(async () => (await box(branch)).width).toBeGreaterThan(width + 20)
  const zoom = page.locator('.zoom-value')
  const initialZoom = await zoom.textContent()
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await expect(zoom).not.toHaveText(initialZoom ?? '')
  await expect(branch).toBeVisible()
  await expect(stroke).toBeVisible()
})

test('first spatial frame keeps the loading mask until the renderer is ready', async ({ page }) => {
  let release: () => void = () => undefined
  let chunkRequested = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/SpatialBackdrop-[^/]+\.js(?:\?.*)?$/, async (route) => {
    chunkRequested = true
    await gate
    await route.continue()
  })
  try {
    await page.goto(story, { waitUntil: 'domcontentloaded' })
    await expect.poll(() => chunkRequested).toBe(true)
    const mask = page.locator('[data-canvas-loading]')
    await expect(mask).toBeVisible()
    await expect(mask).toHaveAttribute('aria-busy', 'true')
    await expect(surface(page)).toHaveCount(1)
    await expect(page.getByLabel('视角方向')).toHaveAttribute('aria-disabled', 'true')
    const branch = node(page, 'branch-a')
    await expect(branch).toBeVisible()
    const before = await box(branch)
    await drag(page, { x: before.x + before.width / 2, y: before.y + 3 }, 65, 30, 5)
    await page.locator('#sheet-panel').focus()
    await page.keyboard.press('F2')
    await expect(branch).not.toHaveClass(/selected/)
    await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toHaveCount(0)
    await expect.poll(async () => (await box(branch)).x).toBeCloseTo(before.x, 0)
  } finally {
    release()
  }
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await expect(surface(page)).toHaveCount(1)
  await expect(page.getByLabel('视角方向')).toHaveAttribute('aria-disabled', 'false')
  const branch = node(page, 'branch-a')
  await branch.click()
  await page.keyboard.press('F2')
  await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toBeFocused()
})

test('WebGL unavailable releases the loading mask and leaves topic editing usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // The proxy forwards each call with its original canvas receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: new Proxy(original, {
        apply: (target, canvas, args) => {
          const kind: unknown = args[0]
          if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null
          return Reflect.apply(target, canvas, args) as unknown
        },
      }),
    })
  })
  await page.goto(story)
  await expect(page.locator('[data-view-mode="3d"]')).toBeVisible()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: '立体渲染暂不可用，编辑仍可继续' }),
  ).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '方向控件不可用' })).toBeVisible()
  const branch = node(page, 'branch-a')
  await branch.click()
  await page.keyboard.press('F2')
  await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toBeFocused()
})
