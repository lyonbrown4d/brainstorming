import { expect, test, type Locator, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const bounds = async (element: Locator) => {
  const box = await element.boundingBox()
  if (!box) throw new Error('Missing spatial canvas geometry')
  return box
}
const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-空间视图--interactive&viewMode=story')
  await expect(page.locator('[data-view-mode="3d"]')).toBeVisible()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await expect(page.locator('[data-spatial-renderer]')).toBeVisible()
  await expect(node(page, 'branch-a')).toBeVisible()
}
const depthInput = (page: Page) =>
  page.getByRole('spinbutton', { name: '主题深度数值', exact: true })
const openDepth = async (page: Page) => {
  if (!(await depthInput(page).isVisible()))
    await page.getByRole('button', { name: '深度', exact: true }).click()
  await expect(depthInput(page)).toBeVisible()
}

test('3D keeps the editable canvas, ink, relations and selected topic controls', async ({
  page,
}) => {
  await open(page)
  const mode = page.locator('header').getByRole('radiogroup', { name: '画布视图', exact: true })
  await expect(mode).toBeVisible()
  const header = await bounds(page.locator('header'))
  const switchBounds = await bounds(mode)
  expect(
    Math.abs(switchBounds.x + switchBounds.width / 2 - header.x - header.width / 2),
  ).toBeLessThan(2)
  await expect(page.locator('[data-drawing-id="spatial-ink"]')).toBeVisible()
  await expect(page.locator('.react-flow__edge-relation')).toHaveCount(1)

  await node(page, 'branch-a').click()
  await expect(node(page, 'branch-a').locator('.topic-scale-control')).toHaveCount(4)
  await expect(node(page, 'branch-b').locator('.topic-scale-control')).toHaveCount(0)
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('三维构思')
  await page.keyboard.press('Enter')
  await expect(node(page, 'branch-a').locator('.topic-title')).toContainText('三维构思')
  await expect(editor).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(5)
  await expect(editor).toBeFocused()
  await page.keyboard.press('Escape')

  await page.getByRole('radio', { name: '二维视图', exact: true }).click()
  await expect(page.locator('[data-view-mode="2d"]')).toBeVisible()
  await expect(page.locator('[data-spatial-renderer]')).toHaveCount(0)
  await expect(node(page, 'branch-a').locator('.topic-title')).toContainText('三维构思')
  await page.getByRole('radio', { name: '三维视图', exact: true }).click()
  await expect(page.locator('[data-view-mode="3d"]')).toBeVisible()
  await expect(page.locator('[data-drawing-id="spatial-ink"]')).toBeVisible()
  await expect(page.locator('.react-flow__edge-relation')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/canvas/spatial-3d.png' })
})

test('3D pointer drag commits once and undo restores the selected branch', async ({ page }) => {
  await open(page)
  const branch = node(page, 'branch-a')
  await branch.click()
  const before = await bounds(branch)
  const grab = { x: before.x + before.width / 2, y: before.y + 3 }
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 5, grab.y)
  await page.mouse.move(grab.x + 85, grab.y + 35, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await bounds(branch)).x).toBeGreaterThan(before.x + 35)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(branch)).x).toBeCloseTo(before.x, 0)
  await expect.poll(async () => (await bounds(branch)).y).toBeCloseTo(before.y, 0)
  await expect(node(page, 'detail')).toBeVisible()
})

test('topic depth has one undo step and only changes the spatial projection', async ({ page }) => {
  await open(page)
  const branch = node(page, 'branch-a')
  await branch.click()
  const original = await bounds(branch)
  await openDepth(page)
  await depthInput(page).fill('175')
  await depthInput(page).press('Enter')
  await expect(depthInput(page)).toHaveValue('175')
  await expect
    .poll(async () => {
      const shifted = await bounds(branch)
      return Math.hypot(shifted.x - original.x, shifted.y - original.y)
    })
    .toBeGreaterThan(25)
  const shifted = await bounds(branch)
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(branch)).x).toBeCloseTo(original.x, 0)
  await expect.poll(async () => (await bounds(branch)).y).toBeCloseTo(original.y, 0)
  await openDepth(page)
  await expect(depthInput(page)).toHaveValue('0')
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await openDepth(page)
  await expect(depthInput(page)).toHaveValue('175')
  await expect.poll(async () => (await bounds(branch)).x).toBeCloseTo(shifted.x, 0)

  await page.getByRole('radio', { name: '二维视图', exact: true }).click()
  await expect(page.locator('[data-view-mode="2d"]')).toBeVisible()
  await expect(branch).toBeVisible()
  const planar = await bounds(branch)
  expect(Math.hypot(planar.x - shifted.x, planar.y - shifted.y)).toBeGreaterThan(25)
  await page.getByRole('radio', { name: '三维视图', exact: true }).click()
  await expect.poll(async () => (await bounds(branch)).x).toBeCloseTo(shifted.x, 0)
  await openDepth(page)
  await expect(depthInput(page)).toHaveValue('175')
  await page.getByRole('button', { name: '重置深度', exact: true }).click()
  await expect(depthInput(page)).toHaveValue('0')
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await openDepth(page)
  await expect(depthInput(page)).toHaveValue('175')
})
