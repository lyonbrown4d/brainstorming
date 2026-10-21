import { expect, test, type Locator, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const ink = (page: Page) => page.locator('.react-flow__node-ink')
const bounds = async (element: Locator) => {
  const box = await element.boundingBox()
  if (!box) throw new Error('Missing spatial canvas geometry')
  return box
}
const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-空间视图--interactive&viewMode=story')
  await expect(page.locator('[data-view-mode="3d"]')).toBeVisible()
  await expect(page.locator('[data-spatial-renderer] canvas')).toBeVisible()
  await expect(node(page, 'branch-a')).toBeVisible()
}

test('3D relation control drag changes the path and one undo restores it', async ({ page }) => {
  await open(page)
  const path = page.locator('#relation-spatial-relation')
  const before = await path.getAttribute('d')
  expect(before).toBeTruthy()
  await page.getByRole('button', { name: '关联线：互相支持', exact: true }).click()
  const control = page.getByTestId('relation-control-spatial-relation-0')
  await expect(control).toBeVisible()
  const grip = await bounds(control)
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 70, from.y - 65, { steps: 12 })
  await page.mouse.up()
  await expect(path).not.toHaveAttribute('d', before ?? '')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(path).toHaveAttribute('d', before ?? '')
})

test('3D moves a selected topic subtree and ink together, then undoes both once', async ({
  page,
}) => {
  await open(page)
  const branch = node(page, 'branch-a')
  const child = node(page, 'detail')
  const root = node(page, 'root')
  const stroke = ink(page)
  const before = {
    branch: await bounds(branch),
    child: await bounds(child),
    root: await bounds(root),
    stroke: await bounds(stroke),
  }
  await branch.click()
  await page.locator('[data-drawing-id="spatial-ink"]').click({ modifiers: ['Meta'] })
  await expect(branch).toHaveClass(/selected/)
  await expect(stroke).toHaveClass(/selected/)
  await expect(root).not.toHaveClass(/selected/)

  const grab = { x: before.branch.x + before.branch.width / 2, y: before.branch.y + 3 }
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 5, grab.y)
  await page.mouse.move(grab.x + 75, grab.y + 40, { steps: 12 })
  await page.mouse.up()
  for (const [target, original] of [
    [branch, before.branch],
    [child, before.child],
    [stroke, before.stroke],
  ] as const) {
    await expect.poll(async () => (await bounds(target)).x).toBeCloseTo(original.x + 70, 0)
    await expect.poll(async () => (await bounds(target)).y).toBeCloseTo(original.y + 40, 0)
  }
  await expect.poll(async () => (await bounds(root)).x).toBeCloseTo(before.root.x, 0)

  await page.keyboard.press('ControlOrMeta+z')
  for (const [target, original] of [
    [branch, before.branch],
    [child, before.child],
    [stroke, before.stroke],
  ] as const) {
    await expect.poll(async () => (await bounds(target)).x).toBeCloseTo(original.x, 0)
    await expect.poll(async () => (await bounds(target)).y).toBeCloseTo(original.y, 0)
  }
})
