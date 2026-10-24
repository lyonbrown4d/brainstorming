import { expect, test } from '@playwright/test'
import {
  clickSpatial,
  emptySpatialPoint,
  locatorBounds,
  openSpatial,
  openSpatialCamera,
  settledSpatialRect,
  spatialCanvas,
  spatialDistance,
  spatialMarqueePoints,
  spatialEvidence,
  spatialRect,
} from '@tests/canvas/spatial-test-geometry'

test('right drag trucks the actual Three camera without orbiting or opening a menu', async ({
  page,
}) => {
  await openSpatial(page)
  const before = await spatialRect(page, 'branch-a'),
    original = await spatialEvidence(page)
  const point = await emptySpatialPoint(page)
  await page.mouse.move(point.x, point.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(point.x + 110, point.y + 55, { steps: 12 })
  await page.mouse.up({ button: 'right' })
  await expect
    .poll(async () => {
      const rect = await spatialRect(page, 'branch-a')
      return Math.hypot(rect.x - before.x, rect.y - before.y)
    })
    .toBeGreaterThan(25)
  await settledSpatialRect(page, 'branch-a')
  expect((await spatialEvidence(page)).view.yaw).toBe(original.view.yaw)
  expect((await spatialEvidence(page)).view.pitch).toBe(original.view.pitch)
  expect((await spatialEvidence(page)).camera).not.toEqual(original.camera)
  await expect(page.getByRole('menu')).toHaveCount(0)
})

test('two-finger wheel pans and Ctrl-wheel pinches without zooming the page', async ({ page }) => {
  await openSpatial(page)
  const original = await spatialRect(page, 'branch-a'),
    point = await emptySpatialPoint(page)
  const pageScale = await page.evaluate(() => window.devicePixelRatio),
    distance = await spatialDistance(page)
  await page.mouse.move(point.x, point.y)
  await page.mouse.wheel(85, 70)
  await expect
    .poll(async () => {
      const rect = await spatialRect(page, 'branch-a')
      return Math.hypot(rect.x - original.x, rect.y - original.y)
    })
    .toBeGreaterThan(15)
  await expect.poll(() => spatialDistance(page)).toBe(distance)
  const panned = await spatialRect(page, 'branch-a')
  await page.keyboard.down('Control')
  try {
    await page.mouse.wheel(0, -40)
  } finally {
    await page.keyboard.up('Control')
  }
  await expect.poll(() => spatialDistance(page)).toBeLessThan(distance)
  await expect
    .poll(async () => (await spatialRect(page, 'branch-a')).width)
    .toBeGreaterThan(panned.width)
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(pageScale)
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0)
})

test('Alt-wheel rotates with one undo while keeping title editing ready', async ({ page }) => {
  await openSpatial(page)
  const original = await spatialEvidence(page),
    point = await emptySpatialPoint(page)
  await page.mouse.move(point.x, point.y)
  await page.keyboard.down('Alt')
  try {
    await page.mouse.wheel(60, 40)
  } finally {
    await page.keyboard.up('Alt')
  }
  await expect.poll(async () => (await spatialEvidence(page)).view.yaw).not.toBe(original.view.yaw)
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await spatialEvidence(page)).view.yaw).toBe(original.view.yaw)
  await clickSpatial(page, 'branch-a')
  await page.keyboard.press('F2')
  await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toBeFocused()
})

test('Shift marquee selects a topic while preserving actual camera pose', async ({ page }) => {
  await openSpatial(page)
  const camera = (await spatialEvidence(page)).camera
  const points = await spatialMarqueePoints(page, 'branch-a')
  await page.keyboard.down('Shift')
  try {
    await page.mouse.move(points.start.x, points.start.y)
    await page.mouse.down()
    await page.mouse.move(points.end.x, points.end.y, { steps: 10 })
    await page.mouse.up()
  } finally {
    await page.keyboard.up('Shift')
  }
  await expect.poll(async () => (await spatialEvidence(page)).selected).toContain('branch-a')
  const after = (await spatialEvidence(page)).camera
  expect(after).toHaveLength(camera.length)
  expect(
    Math.max(...after.map((value, index) => Math.abs(value - (camera[index] ?? Infinity)))),
  ).toBeLessThan(1e-9)
})

test('pane resize preserves camera distance and scales the Three perspective by pane height', async ({
  page,
}) => {
  await openSpatial(page)
  const before = await spatialRect(page, 'branch-a'),
    pane = await locatorBounds(spatialCanvas(page)),
    distance = await spatialDistance(page)
  await page.setViewportSize({ width: 1440, height: 1050 })
  await expect
    .poll(async () => (await locatorBounds(spatialCanvas(page))).height)
    .toBeGreaterThan(pane.height)
  await expect
    .poll(async () => {
      const resized = await locatorBounds(spatialCanvas(page))
      const ratio = (await spatialRect(page, 'branch-a')).width / before.width
      return ratio / (resized.height / pane.height)
    })
    .toBeCloseTo(1, 2)
  await expect.poll(() => spatialDistance(page)).toBe(distance)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect
    .poll(async () => (await spatialRect(page, 'branch-a')).width)
    .toBeCloseTo(before.width, 0)
})

test('buttons, shortcuts and pinch change the same Three camera distance', async ({ page }) => {
  await openSpatial(page)
  const first = await spatialDistance(page)
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await expect.poll(() => spatialDistance(page)).toBeLessThan(first)
  const button = await spatialDistance(page)
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+-')
  await expect.poll(() => spatialDistance(page)).toBeGreaterThan(button)
  const before = await spatialDistance(page),
    point = await emptySpatialPoint(page)
  await page.mouse.move(point.x, point.y)
  await page.keyboard.down('Control')
  try {
    await page.mouse.wheel(0, -40)
  } finally {
    await page.keyboard.up('Control')
  }
  await expect.poll(() => spatialDistance(page)).toBeLessThan(before * 0.8)
  await page.getByRole('button', { name: '重置视距', exact: true }).click()
  await expect.poll(() => spatialDistance(page)).toBeGreaterThan(0)
})

test('fit preserves the chosen camera angle and title editing remains available', async ({
  page,
}) => {
  await openSpatial(page)
  await openSpatialCamera(page)
  await page.getByRole('button', { name: '右侧', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  await settledSpatialRect(page, 'branch-a')
  expect((await spatialEvidence(page)).view.yaw).toBeCloseTo(Math.PI / 2)
  const rect = await spatialRect(page, 'branch-a'),
    pane = await locatorBounds(spatialCanvas(page))
  expect(rect.x + rect.width).toBeGreaterThan(pane.x)
  expect(rect.x).toBeLessThan(pane.x + pane.width)
  await clickSpatial(page, 'branch-a')
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('三维适应后仍可编辑')
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => (await spatialEvidence(page)).document.topics['branch-a']?.title)
    .toBe('三维适应后仍可编辑')
})

test('Tab-created child stays visible and focused in the independent Three canvas', async ({
  page,
}) => {
  await openSpatial(page)
  await clickSpatial(page, 'branch-a')
  await page.keyboard.press('Tab')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await expect(editor).toBeInViewport()
  await page.keyboard.insertText('空间新想法')
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => Object.keys((await spatialEvidence(page)).document.topics).length)
    .toBe(5)
  await expect
    .poll(async () =>
      Object.values((await spatialEvidence(page)).document.topics).some(
        (topic) => topic.title === '空间新想法',
      ),
    )
    .toBe(true)
  const created = Object.values((await spatialEvidence(page)).document.topics).find(
    (topic) => topic.title === '空间新想法',
  )
  if (!created) throw new Error('New spatial child was not saved')
  await expect
    .poll(async () =>
      (await spatialEvidence(page)).rectangles.some((rect) => rect.id === created.id),
    )
    .toBe(true)
})
