import { cameraScale, exposedTopicPoint } from '@tests/canvas/spatial-test-geometry'
import { expect, test, type Locator, type Page } from '@playwright/test'

const story = '/iframe.html?id=brainstorming-空间视图--interactive&viewMode=story'
const topic = (page: Page, id: string): Locator =>
  page.locator(`.react-flow__node[data-id="${id}"]`)

const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Missing spatial topic geometry')
  return box
}

const open = async (page: Page): Promise<void> => {
  await page.goto(story)
  await expect(page.locator('[data-view-mode="3d"]')).toBeVisible()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('[data-spatial-renderer] canvas')).toBeVisible()
  await expect(topic(page, 'branch-a')).toBeVisible()
}

/** Pick a real exposed pane point, clear of nodes, panels, and the camera widget. */
const emptyPanePoint = async (page: Page): Promise<{ x: number; y: number }> =>
  page.locator('.react-flow__pane').evaluate((pane) => {
    const rect = pane.getBoundingClientRect()
    for (const y of [0.72, 0.6, 0.42, 0.28])
      for (const x of [0.12, 0.2, 0.8, 0.88]) {
        const point = { x: rect.left + rect.width * x, y: rect.top + rect.height * y }
        if (document.elementFromPoint(point.x, point.y) === pane) return point
      }
    throw new Error('No exposed empty pane point for the camera gesture')
  })

const moved = async (locator: Locator, original: Awaited<ReturnType<typeof bounds>>) => {
  const current = await bounds(locator)
  return Math.hypot(current.x - original.x, current.y - original.y)
}

test('right drag on empty canvas trucks the scene without changing its angle or opening a menu', async ({
  page,
}) => {
  await open(page)
  const branch = topic(page, 'branch-a')
  const before = await bounds(branch)
  const beforeScale = await cameraScale(branch)
  const point = await emptyPanePoint(page)

  await page.mouse.move(point.x, point.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(point.x + 110, point.y + 55, { steps: 12 })
  await page.mouse.up({ button: 'right' })

  await expect.poll(() => moved(branch, before)).toBeGreaterThan(25)
  await expect.poll(async () => await cameraScale(branch)).toBeCloseTo(beforeScale, 4)
  await expect(page.getByRole('menu')).toHaveCount(0)
})

test('two-finger wheel pans and Ctrl-wheel pinches the map without zooming the page', async ({
  page,
}) => {
  await open(page)
  const branch = topic(page, 'branch-a')
  const original = await bounds(branch)
  const point = await emptyPanePoint(page)
  const pageScale = await page.evaluate(() => window.devicePixelRatio)
  const zoom = page.locator('.zoom-value')
  const originalZoom = await zoom.textContent()

  await page.mouse.move(point.x, point.y)
  await page.mouse.wheel(85, 70)
  await expect.poll(() => moved(branch, original)).toBeGreaterThan(15)
  await expect(zoom).toHaveText(originalZoom ?? '')

  const panned = await bounds(branch)
  await page.keyboard.down('Control')
  try {
    await page.mouse.wheel(0, -40)
  } finally {
    await page.keyboard.up('Control')
  }
  await expect(zoom).not.toHaveText(originalZoom ?? '')
  await expect.poll(async () => (await bounds(branch)).width).not.toBeCloseTo(panned.width, 0)
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(pageScale)
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0)
})

test('Alt-wheel rotates the spatial map while keeping the editor ready', async ({ page }) => {
  await open(page)
  const branch = topic(page, 'branch-a')
  const before = await bounds(branch)
  const point = await emptyPanePoint(page)
  const zoom = await page.locator('.zoom-value').textContent()

  await page.mouse.move(point.x, point.y)
  await page.keyboard.down('Alt')
  try {
    await page.mouse.wheel(60, 40)
  } finally {
    await page.keyboard.up('Alt')
  }
  await expect.poll(() => moved(branch, before)).toBeGreaterThan(8)
  await expect(page.locator('.zoom-value')).toHaveText(zoom ?? '')
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(branch)).x).toBeCloseTo(before.x, 0)
  await expect.poll(async () => (await bounds(branch)).y).toBeCloseTo(before.y, 0)
})

test('Shift marquee selects a topic without rotating the camera', async ({ page }) => {
  await open(page)
  const branch = topic(page, 'branch-a')
  const before = await bounds(branch)
  await page.keyboard.down('Shift')
  try {
    await page.mouse.move(before.x - 18, before.y - 18)
    await page.mouse.down()
    await page.mouse.move(before.x + before.width + 18, before.y + before.height + 18, {
      steps: 10,
    })
    await page.mouse.up()
  } finally {
    await page.keyboard.up('Shift')
  }
  await expect(branch).toHaveClass(/selected/)
  await expect.poll(async () => (await bounds(branch)).x).toBeCloseTo(before.x, 0)
  await expect.poll(async () => (await bounds(branch)).y).toBeCloseTo(before.y, 0)
})

test('resizing the pane keeps the perspective camera and editable cards at the same scale', async ({
  page,
}) => {
  await open(page)
  const branch = topic(page, 'branch-a')
  const before = await bounds(branch)
  const pane = await bounds(page.locator('.react-flow__pane'))
  const zoom = page.locator('.zoom-value')
  const initialDistance = await zoom.textContent()
  await page.setViewportSize({ width: 1440, height: 1050 })
  const resizedPane = await bounds(page.locator('.react-flow__pane'))
  const ratio = resizedPane.height / pane.height
  await expect.poll(async () => (await bounds(branch)).width / before.width).toBeCloseTo(ratio, 2)
  await expect(zoom).toHaveText(initialDistance ?? '')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect.poll(async () => (await bounds(branch)).width).toBeCloseTo(before.width, 0)
})

const cameraDistance = async (page: Page): Promise<number> => {
  const text = await page.locator('.zoom-value').textContent()
  const value = Number(text?.replace(/[^\d]/g, '') ?? '')
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid 3D camera distance: ${text}`)
  return value
}

test('3D buttons, keyboard shortcuts, and pinch all change the same native camera distance', async ({
  page,
}) => {
  await open(page)
  const first = await cameraDistance(page)
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await expect.poll(() => cameraDistance(page)).toBeLessThan(first)
  const afterButton = await cameraDistance(page)
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+-')
  await expect.poll(() => cameraDistance(page)).toBeGreaterThan(afterButton)
  const beforePinch = await cameraDistance(page)
  const point = await emptyPanePoint(page)
  await page.mouse.move(point.x, point.y)
  await page.keyboard.down('Control')
  try {
    await page.mouse.wheel(0, -40)
  } finally {
    await page.keyboard.up('Control')
  }
  await expect.poll(() => cameraDistance(page)).toBeLessThan(beforePinch * 0.8)
  await page.getByRole('button', { name: '重置视距', exact: true }).click()
  await expect.poll(() => cameraDistance(page)).toBeGreaterThan(0)
})

test('native 3D fit preserves the chosen angle and leaves topics editable', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '视角', exact: true }).click()
  await page.getByRole('button', { name: '右侧', exact: true }).click()
  const yaw = page.getByRole('slider').first()
  await expect(yaw).toHaveAttribute('aria-valuenow', '90')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  await expect(topic(page, 'branch-a')).toBeInViewport()
  await page.getByRole('button', { name: '视角', exact: true }).click()
  await expect(page.getByRole('slider').first()).toHaveAttribute('aria-valuenow', '90')
  await page.keyboard.press('Escape')
  const point = await exposedTopicPoint(topic(page, 'branch-a'))
  await page.mouse.click(point.x, point.y)
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('三维适应后仍可编辑')
  await page.keyboard.press('Enter')
  await expect(topic(page, 'branch-a')).toContainText('三维适应后仍可编辑')
})

test('Tab-created child stays visible and focused while the 3D camera follows native layout', async ({
  page,
}) => {
  await open(page)
  await topic(page, 'branch-a').click()
  await page.keyboard.press('Tab')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await expect(editor).toBeInViewport()
  await page.keyboard.insertText('空间新想法')
  await page.keyboard.press('Enter')
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(5)
  await expect(page.getByText('空间新想法', { exact: true })).toBeInViewport()
})
