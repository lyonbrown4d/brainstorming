import { expect, test, type Locator, type Page } from '@playwright/test'
import type { MindMapDocument } from '@core'

interface Evidence {
  document: MindMapDocument
  past: number
  selected: string
}
const evidence = async (page: Page): Promise<Evidence> =>
  JSON.parse((await page.getByTestId('direct-topic-evidence').textContent()) ?? '{}') as Evidence
const bounds = async (element: Locator) => {
  const rect = await element.boundingBox()
  if (!rect) throw new Error('Missing topic control geometry')
  return rect
}
const open = async (page: Page, story = 'width-and-add') => {
  await page.goto(`/iframe.html?id=brainstorming-主题直接操作--${story}&viewMode=story`)
  await expect(page.getByTestId('direct-topic-evidence')).toBeAttached({ timeout: 15_000 })
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
}
const drag = async (page: Page, handle: Locator, dx: number, cancel?: string) => {
  const rect = await bounds(handle)
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2 + dx, rect.y + rect.height / 2, { steps: 10 })
  if (cancel) await page.keyboard.press(cancel)
  await page.mouse.up()
}
const topic = (page: Page) => page.locator('.react-flow__node[data-id="branch"]')

test('side width drag reflows without scaling, commits once, and restores through undo/redo', async ({
  page,
}) => {
  await open(page)
  const card = topic(page)
  const handle = card.locator('.topic-width-right')
  await expect(handle).toBeVisible()
  const original = await bounds(card)
  const before = await evidence(page)
  const font = await card
    .locator('.topic-title')
    .evaluate((element) => getComputedStyle(element).fontSize)
  await drag(page, handle, -120)
  await expect.poll(async () => (await evidence(page)).past).toBe(before.past + 1)
  const resized = await evidence(page)
  expect(resized.document.topics.branch?.style?.width).toBeLessThan(260)
  expect(resized.document.topics.branch?.style?.scale).toBe(1.25)
  expect(
    await card.locator('.topic-title').evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe(font)
  expect((await bounds(card)).height).toBeGreaterThan(original.height)
  await page.keyboard.press('ControlOrMeta+z')
  await expect
    .poll(async () => (await evidence(page)).document.topics.branch?.style?.width)
    .toBe(260)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect
    .poll(async () => (await evidence(page)).document.topics.branch?.style?.width)
    .toBe(resized.document.topics.branch?.style?.width)
  const resizedBounds = await bounds(card)
  await drag(page, handle, 100, 'Escape')
  expect((await evidence(page)).past).toBe(resized.past)
  await expect.poll(async () => (await bounds(card)).width).toBeCloseTo(resizedBounds.width, 0)
})

test('nearby add focuses the new title and root exposes only child creation', async ({ page }) => {
  await open(page)
  const before = await evidence(page)
  await page.getByRole('button', { name: '在此主题下添加子主题', exact: true }).click()
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  const added = await evidence(page)
  expect(added.document.topics.branch?.children).toContain(added.selected)
  expect(added.past).toBe(before.past + 1)
  await page.keyboard.press('Escape')
  await page.locator('.react-flow__node[data-id="root"]').click()
  await expect(
    page.getByRole('button', { name: '在此主题后添加同级主题', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '在此主题下添加子主题', exact: true }),
  ).toBeVisible()
})

test('left width grip keeps its opposite edge during preview, cancels, and commits one undo', async ({
  page,
}) => {
  await open(page)
  const card = topic(page)
  const handle = card.locator('.topic-width-left')
  await expect(handle).toBeVisible()
  const before = await evidence(page)
  const original = await bounds(card)
  const grip = await bounds(handle)
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 70, start.y, { steps: 10 })
  await expect.poll(async () => (await bounds(card)).width).toBeGreaterThan(original.width + 30)
  const preview = await bounds(card)
  expect(preview.x + preview.width).toBeCloseTo(original.x + original.width, 0)
  expect((await evidence(page)).past).toBe(before.past)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(async () => (await bounds(card)).x).toBeCloseTo(original.x, 0)
  await expect.poll(async () => (await bounds(card)).width).toBeCloseTo(original.width, 0)
  await drag(page, handle, -70)
  await expect.poll(async () => (await evidence(page)).past).toBe(before.past + 1)
  expect((await evidence(page)).document.topics.branch?.style?.width).toBeGreaterThan(260)
  expect((await evidence(page)).document.topics.branch?.style?.scale).toBe(1.25)
  await page.keyboard.press('ControlOrMeta+z')
  await expect
    .poll(async () => (await evidence(page)).document.topics.branch?.style?.width)
    .toBe(260)
})

test('circle width remains circular and a cancelled drag leaves no history', async ({ page }) => {
  await open(page, 'circle')
  const card = topic(page)
  await expect(card.locator('.topic-width-right')).toBeVisible()
  await drag(page, card.locator('.topic-width-right'), 90)
  const rect = await bounds(card)
  expect(rect.width).toBeCloseTo(rect.height, 0)
  const before = await evidence(page)
  await drag(page, card.locator('.topic-width-right'), -60, 'Escape')
  expect((await evidence(page)).past).toBe(before.past)
})

test('Three screen-space width and nearby creation use the shared document commands', async ({
  page,
}) => {
  await open(page, 'spatial')
  const handle = page
    .locator('[data-spatial-topic-controls]')
    .getByRole('button', { name: '拖动调整主题宽度', exact: true })
  await expect(handle).toBeVisible({ timeout: 20000 })
  const before = await evidence(page)
  await drag(page, handle, -70, 'Escape')
  expect((await evidence(page)).past).toBe(before.past)
  await drag(page, handle, 80)
  await expect.poll(async () => (await evidence(page)).past).toBe(before.past + 1)
  expect((await evidence(page)).document.topics.branch?.style?.scale).toBe(1.25)
  await page.keyboard.press('ControlOrMeta+z')
  await expect
    .poll(async () => (await evidence(page)).document.topics.branch?.style?.width)
    .toBe(260)
  const left = page.locator('[data-spatial-topic-controls]').getByRole('button', {
    name: '从左侧拖动调整主题宽度',
    exact: true,
  })
  await expect(left).toBeVisible()
  const controlBounds = await bounds(page.locator('[data-spatial-topic-controls]'))
  const leftBounds = await bounds(left)
  const start = { x: leftBounds.x + leftBounds.width / 2, y: leftBounds.y + leftBounds.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 50, start.y, { steps: 10 })
  const spatialPreview = page.locator('[data-spatial-width-preview]')
  await expect(spatialPreview).toBeVisible()
  const previewBounds = await bounds(spatialPreview)
  expect(previewBounds.x + previewBounds.width).toBeCloseTo(
    controlBounds.x + controlBounds.width,
    0,
  )
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(spatialPreview).toHaveCount(0)
  expect((await evidence(page)).document.topics.branch?.style?.width).toBe(260)
  await drag(page, left, -50)
  await expect
    .poll(async () => (await evidence(page)).document.topics.branch?.style?.width)
    .toBeGreaterThan(260)
  expect((await evidence(page)).document.topics.branch?.style?.scale).toBe(1.25)
  await page.keyboard.press('ControlOrMeta+z')
  await expect
    .poll(async () => (await evidence(page)).document.topics.branch?.style?.width)
    .toBe(260)
  await page.getByRole('button', { name: '在此主题后添加同级主题', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toBeFocused()
})
