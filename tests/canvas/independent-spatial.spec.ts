import { expect, test, type Page } from '@playwright/test'

interface Rectangle {
  id: string
  x: number
  y: number
  width: number
  height: number
  depth: number
}
interface Evidence {
  count: number
  title: string
  selected: string[]
  topic: object
  camera: number[]
  view: {
    yaw: number
    pitch: number
    cameraDistance: number
    target?: { x: number; y: number; z: number }
  }
  rectangles: Rectangle[]
}
const evidence = async (page: Page): Promise<Evidence> =>
  page
    .getByTestId('independent-spatial-evidence')
    .evaluate(
      (element) =>
        (element as HTMLOutputElement & { readonly spatialEvidence: Evidence }).spatialEvidence,
    )
const rectangle = async (page: Page, id = 'branch-a') => {
  const rect = (await evidence(page)).rectangles.find((item) => item.id === id)
  if (!rect) throw new Error(`Missing projected topic ${id}`)
  return rect
}
const open = async (page: Page) => {
  await page.goto(
    '/iframe.html?id=brainstorming-independent-spatial-canvas--interactive&viewMode=story',
  )
  await expect(page.locator('#sheet-panel[data-spatial-independent]')).toBeVisible({
    timeout: 15000,
  })
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('canvas[data-spatial-canvas="three"]')).toBeVisible()
  await expect(page.locator('.react-flow')).toHaveCount(0)
  await expect.poll(async () => (await evidence(page)).rectangles.length).toBe(4)
}
const drag = async (page: Page, from: { x: number; y: number }, dx: number, dy: number) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 5, from.y)
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 })
  await page.mouse.up()
}
const blankPoint = async (page: Page) => {
  const canvas = await page.locator('canvas[data-spatial-canvas="three"]').boundingBox()
  if (!canvas) throw new Error('Missing Three canvas')
  const { rectangles } = await evidence(page)
  for (const y of [0.7, 0.55, 0.35])
    for (const x of [0.12, 0.88, 0.2, 0.8]) {
      const point = { x: canvas.x + canvas.width * x, y: canvas.y + canvas.height * y }
      if (
        !rectangles.some(
          (rect) =>
            point.x >= rect.x - 20 &&
            point.x <= rect.x + rect.width + 20 &&
            point.y >= rect.y - 20 &&
            point.y <= rect.y + rect.height + 20,
        )
      )
        return point
    }
  throw new Error('No empty canvas point for orbit')
}

test('Three first frame draws content without shader errors; blank drag and wheel move its camera', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /shader|WebGL|THREE/i.test(message.text()))
      errors.push(message.text())
  })
  await open(page)
  await page.screenshot({ path: testInfo.outputPath('independent-spatial-first-frame.png') })
  const original = await evidence(page)
  const point = await blankPoint(page)
  await drag(page, point, 130, 55)
  // Wheel follows physical pointer-up immediately, including the damping phase.
  await page.mouse.wheel(0, -180)
  await expect.poll(async () => (await evidence(page)).camera).not.toEqual(original.camera)
  await expect.poll(async () => (await evidence(page)).view.yaw).not.toBe(original.view.yaw)
  await expect
    .poll(async () => (await evidence(page)).view.target)
    .not.toEqual(original.view.target)
  expect((await evidence(page)).count).toBe(4)
  expect(errors).toEqual([])
})

test('actual topic picking, dragging, four grips, Chinese title commit and 2D return preserve the document', async ({
  page,
}) => {
  await open(page)
  const target = await rectangle(page)
  const point = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
  await page.mouse.click(point.x, point.y)
  await expect.poll(async () => (await evidence(page)).selected).toEqual(['branch-a'])
  await expect(page.locator('[data-spatial-scale] button')).toHaveCount(4)
  for (const grip of await page.locator('[data-spatial-scale] button').all())
    await expect(grip).toBeVisible()
  const original = (await evidence(page)).topic
  await drag(page, point, 60, 35)
  await expect.poll(async () => (await evidence(page)).topic).not.toEqual(original)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await evidence(page)).topic).toEqual(original)
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('中文空间想法')
  await page.evaluate(() => {
    document.documentElement.dataset.spatialRebuildGateObserved = 'false'
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-canvas-loading]')) {
        document.documentElement.dataset.spatialRebuildGateObserved = 'true'
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-spatial-rebuild-gate-observed', 'true')
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await expect(editor).toHaveCount(0)
  await expect.poll(async () => (await evidence(page)).title).toBe('中文空间想法')
  expect((await evidence(page)).count).toBe(4)
  await page.getByRole('radio', { name: '二维视图', exact: true }).click()
  await expect(page.locator('#sheet-panel[data-view-mode="2d"]')).toBeVisible()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await expect(page.locator('.react-flow__node[data-id="branch-a"] .topic-title')).toHaveText(
    '中文空间想法',
  )
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(4)
})
