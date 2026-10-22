import { expect, test, type Locator, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const edge = (page: Page, id: string) => page.locator(`.react-flow__edge[data-id="edge-${id}"]`)
const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Missing projected topic bounds')
  return box
}
const dragToGap = async (page: Page, movingId: string, parentId: string, referenceId?: string) => {
  const moving = await bounds(node(page, movingId))
  const parent = await bounds(node(page, parentId))
  const from = { x: moving.x + moving.width / 2, y: moving.y + 5 }
  let horizontal = true,
    direction = -1
  if (referenceId) {
    const reference = await bounds(node(page, referenceId))
    const dx = parent.x + parent.width / 2 - reference.x - reference.width / 2
    const dy = parent.y + parent.height / 2 - reference.y - reference.height / 2
    horizontal = Math.abs(dx) >= Math.abs(dy)
    direction = Math.sign(horizontal ? dx : dy)
  }
  const center = {
    x:
      parent.x +
      parent.width / 2 +
      (horizontal ? direction * (parent.width / 2 + moving.width / 2 + 22) : 0),
    y:
      parent.y +
      parent.height / 2 +
      (horizontal ? 0 : direction * (parent.height / 2 + moving.height / 2 + 22)),
  }
  const end = { x: center.x + 5, y: center.y - moving.height / 2 + 5 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 5, from.y)
  await page.mouse.move(end.x, end.y, { steps: 14 })
  const actual = await bounds(node(page, movingId))
  // The moving topic remains visibly separate: this must not be a body/halo hit.
  const gap = horizontal
    ? direction > 0
      ? actual.x - parent.x - parent.width
      : parent.x - actual.x - actual.width
    : direction > 0
      ? actual.y - parent.y - parent.height
      : parent.y - actual.y - actual.height
  expect(gap).toBeGreaterThan(12)
  return end
}

for (const mode of ['2d', '3d'] as const) {
  test(`${mode} predicts a parent before contact, follows the drag, cancels and commits with one undo`, async ({
    page,
  }) => {
    const spatial = mode === '3d'
    await page.goto(
      `/iframe.html?id=brainstorming-${spatial ? '空间视图--interactive' : '画布自由绘图--mixed-selection'}&viewMode=story`,
    )
    const movingId = spatial ? 'detail' : 'descendant'
    const targetId = spatial ? 'branch-b' : 'root'
    const originalParent = spatial ? 'branch-a' : 'branch'
    await expect(node(page, movingId)).toBeVisible()
    await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
    const original = await bounds(node(page, movingId))
    const preview = page.getByTestId('drop-preview')
    const line = page.getByTestId(`drop-preview-connection-${movingId}`)
    await dragToGap(page, movingId, targetId, spatial ? 'root' : undefined)
    await expect(preview).toHaveAttribute('data-drop-predicted', 'true')
    await expect(preview).toHaveAttribute('data-parent-id', targetId)
    await expect(line).toHaveAttribute('data-parent-id', targetId)
    const path = await line.getAttribute('d')
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(preview).toHaveCount(0)
    await expect(line).toHaveCount(0)
    await expect(edge(page, movingId)).toHaveAttribute(
      'aria-label',
      `Edge from ${originalParent} to ${movingId}`,
    )
    await expect.poll(async () => (await bounds(node(page, movingId))).x).toBeCloseTo(original.x, 0)
    expect(path).toBeTruthy()

    const end = await dragToGap(page, movingId, targetId, spatial ? 'root' : undefined)
    await expect(preview).toHaveAttribute('data-parent-id', targetId)
    const beforeMove = await line.getAttribute('d')
    await page.mouse.move(end.x, end.y + 3)
    await expect(line).not.toHaveAttribute('d', beforeMove ?? '')
    await page.screenshot({ path: `test-results/canvas/${mode}-early-drop-preview.png` })
    await page.mouse.up()
    await expect(preview).toHaveCount(0)
    await expect(edge(page, movingId)).toHaveAttribute(
      'aria-label',
      `Edge from ${targetId} to ${movingId}`,
    )
    await page.keyboard.press('ControlOrMeta+z')
    await expect(edge(page, movingId)).toHaveAttribute(
      'aria-label',
      `Edge from ${originalParent} to ${movingId}`,
    )
    await expect.poll(async () => (await bounds(node(page, movingId))).x).toBeCloseTo(original.x, 0)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(edge(page, movingId)).toHaveAttribute(
      'aria-label',
      `Edge from ${targetId} to ${movingId}`,
    )
  })
}
