import { expect, test, type Page } from '@playwright/test'
import {
  clickSpatial,
  dragSpatialPoint,
  locatorBounds,
  openSpatial,
  spatialEvidence,
  spatialPoint,
  spatialRect,
} from '@tests/canvas/spatial-test-geometry'

const depthInput = (page: Page) =>
  page.getByRole('spinbutton', { name: '主题深度数值', exact: true })
const openDepth = async (page: Page) => {
  if (!(await depthInput(page).isVisible()))
    await page.getByRole('button', { name: '深度', exact: true }).click()
  await expect(depthInput(page)).toBeVisible()
}

test('3D keeps title editing, child creation, ink, relations and shared document across 2D return', async ({
  page,
}) => {
  await openSpatial(page)
  const mode = page.locator('header').getByRole('radiogroup', { name: '画布视图', exact: true })
  const header = await locatorBounds(page.locator('header')),
    toggle = await locatorBounds(mode)
  expect(Math.abs(toggle.x + toggle.width / 2 - header.x - header.width / 2)).toBeLessThan(2)
  expect(
    (await spatialEvidence(page)).rectangles.some((rect) => rect.id === 'ink-spatial-ink'),
  ).toBe(true)
  expect((await spatialEvidence(page)).document.relations).toHaveLength(1)
  await clickSpatial(page, 'branch-a')
  await expect(page.locator('[data-spatial-scale] button')).toHaveCount(4)
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('三维构思')
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => (await spatialEvidence(page)).document.topics['branch-a']?.title)
    .toBe('三维构思')
  await expect(editor).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(editor).toBeFocused()
  await expect(editor).toBeInViewport()
  await expect
    .poll(async () => Object.keys((await spatialEvidence(page)).document.topics).length)
    .toBe(5)
  await page.keyboard.press('Escape')
  await page.getByRole('radio', { name: '二维视图', exact: true }).click()
  await expect(page.locator('#sheet-panel[data-view-mode="2d"]')).toBeVisible()
  await expect(page.locator('.react-flow__node[data-id="branch-a"] .topic-title')).toContainText(
    '三维构思',
  )
  await page.getByRole('radio', { name: '三维视图', exact: true }).click()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await expect
    .poll(async () =>
      (await spatialEvidence(page)).rectangles.some((rect) => rect.id === 'ink-spatial-ink'),
    )
    .toBe(true)
  expect((await spatialEvidence(page)).document.relations).toHaveLength(1)
  await page.screenshot({ path: 'test-results/canvas/spatial-3d.png' })
})

test('3D pointer drag commits once and undo restores the whole selected branch', async ({
  page,
}) => {
  await openSpatial(page)
  await clickSpatial(page, 'branch-a')
  const before = await spatialRect(page, 'branch-a'),
    child = await spatialRect(page, 'detail')
  const document = (await spatialEvidence(page)).document,
    past = (await spatialEvidence(page)).history.past
  await dragSpatialPoint(page, await spatialPoint(page, 'branch-a'), 85, 35)
  await expect
    .poll(async () => (await spatialRect(page, 'branch-a')).x)
    .toBeGreaterThan(before.x + 35)
  await expect.poll(async () => (await spatialRect(page, 'detail')).x).toBeGreaterThan(child.x + 15)
  await expect.poll(async () => (await spatialEvidence(page)).history.past).toBe(past + 1)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await spatialEvidence(page)).document).toEqual(document)
  await expect.poll(async () => (await spatialRect(page, 'branch-a')).x).toBeCloseTo(before.x, 0)
  await expect.poll(async () => (await spatialRect(page, 'detail')).y).toBeCloseTo(child.y, 0)
})

test('topic depth is one undo step, survives renderer switches and resets reversibly', async ({
  page,
}) => {
  await openSpatial(page)
  await clickSpatial(page, 'branch-a')
  const original = await spatialRect(page, 'branch-a')
  await openDepth(page)
  await depthInput(page).fill('175')
  await depthInput(page).press('Enter')
  await expect(depthInput(page)).toHaveValue('175')
  await expect
    .poll(async () => {
      const rect = await spatialRect(page, 'branch-a')
      return Math.hypot(rect.x - original.x, rect.y - original.y)
    })
    .toBeGreaterThan(25)
  const shifted = await spatialRect(page, 'branch-a')
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await spatialRect(page, 'branch-a')).x).toBeCloseTo(original.x, 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await spatialRect(page, 'branch-a')).x).toBeCloseTo(shifted.x, 0)
  await page.getByRole('radio', { name: '二维视图', exact: true }).click()
  await expect(page.locator('.react-flow__node[data-id="branch-a"]')).toBeVisible()
  const planar = await locatorBounds(page.locator('.react-flow__node[data-id="branch-a"]'))
  expect(Math.hypot(planar.x - shifted.x, planar.y - shifted.y)).toBeGreaterThan(25)
  await page.getByRole('radio', { name: '三维视图', exact: true }).click()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await expect.poll(async () => (await spatialRect(page, 'branch-a')).x).toBeCloseTo(shifted.x, 0)
  await openDepth(page)
  await expect(depthInput(page)).toHaveValue('175')
  await page.getByRole('button', { name: '重置深度', exact: true }).click()
  await expect(depthInput(page)).toHaveValue('0')
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await openDepth(page)
  await expect(depthInput(page)).toHaveValue('175')
})
