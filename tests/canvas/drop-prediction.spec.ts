import {
  openSpatial,
  settledSpatialRect,
  spatialEvidence,
  spatialPoint,
  spatialRect,
} from '@tests/canvas/spatial-test-geometry'
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

test('2D predicts a parent before contact, follows the drag, cancels and commits with one undo', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=brainstorming-画布自由绘图--mixed-selection&viewMode=story')
  const movingId = 'descendant'
  const targetId = 'root'
  const originalParent = 'branch'
  await expect(page.locator('[data-view-mode="2d"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0, { timeout: 15_000 })
  await expect(node(page, movingId)).toBeVisible()
  const original = await bounds(node(page, movingId))
  const preview = page.getByTestId('drop-preview')
  const line = page.getByTestId(`drop-preview-connection-${movingId}`)
  await dragToGap(page, movingId, targetId)
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

  const end = await dragToGap(page, movingId, targetId)
  await expect(preview).toHaveAttribute('data-parent-id', targetId)
  const beforeMove = await line.getAttribute('d')
  await page.mouse.move(end.x, end.y + 3)
  await expect(line).not.toHaveAttribute('d', beforeMove ?? '')
  await page.screenshot({ path: 'test-results/canvas/2d-early-drop-preview.png' })
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

test('3D predicts reparenting before contact, follows the drag, cancels and commits with one undo', async ({
  page,
}) => {
  await openSpatial(page)
  await settledSpatialRect(page, 'detail')
  const original = await spatialEvidence(page),
    before = await spatialRect(page, 'detail')
  const preview = async () => {
    const start = await spatialEvidence(page)
    const moving = start.rectangles.find((rect) => rect.id === 'detail'),
      target = start.rectangles.find((rect) => rect.id === 'branch-b'),
      root = start.rectangles.find((rect) => rect.id === 'root')
    if (!moving || !target || !root) throw new Error('Missing current Three drop geometry')
    const from = await spatialPoint(page, 'detail')
    const horizontal = Math.abs(target.x - root.x) >= Math.abs(target.y - root.y)
    const direction = Math.sign(horizontal ? target.x - root.x : target.y - root.y)
    const destination = {
      x: horizontal
        ? target.x +
          target.width / 2 +
          direction * (target.width / 2 + moving.width / 2 + 22) -
          moving.width / 2
        : target.x + target.width / 2 - moving.width / 2,
      y: horizontal
        ? target.y + target.height / 2 - moving.height / 2
        : target.y +
          target.height / 2 +
          direction * (target.height / 2 + moving.height / 2 + 22) -
          moving.height / 2,
    }
    const end = {
      x: from.x + destination.x - moving.x,
      y: from.y + destination.y - moving.y,
    }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 5, from.y)
    await page.mouse.move(end.x, end.y, { steps: 14 })
    // Evidence samples at 50ms: the correct parent can already be predicted at an
    // intermediate move. Require the final pointer projection before measuring its gap.
    let current = await spatialEvidence(page)
    await expect
      .poll(async () => {
        current = await spatialEvidence(page)
        return {
          drop: current.drop,
          moving: current.rectangles.find((rect) => rect.id === 'detail'),
        }
      })
      .toMatchObject({
        drop: { targetId: 'branch-b', parentId: 'branch-b', predicted: true },
        moving: { x: expect.closeTo(destination.x, 0), y: expect.closeTo(destination.y, 0) },
      })
    const actual = current.rectangles.find((rect) => rect.id === 'detail'),
      currentTarget = current.rectangles.find((rect) => rect.id === 'branch-b')
    if (!actual || !currentTarget) throw new Error('Missing final Three drop geometry')
    const gap = horizontal
      ? direction > 0
        ? actual.x - currentTarget.x - currentTarget.width
        : currentTarget.x - actual.x - actual.width
      : direction > 0
        ? actual.y - currentTarget.y - currentTarget.height
        : currentTarget.y - actual.y - actual.height
    expect(gap).toBeGreaterThan(12)
    return end
  }
  await preview()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(async () => (await spatialEvidence(page)).document).toEqual(original.document)
  await expect.poll(async () => (await spatialEvidence(page)).drop).toBeNull()
  await expect.poll(async () => (await spatialRect(page, 'detail')).x).toBeCloseTo(before.x, 0)
  const end = await preview()
  const line = page.locator('svg line[stroke-dasharray="5 4"]'),
    path = await line.getAttribute('y1')
  await page.mouse.move(end.x, end.y + 3)
  await expect(line).not.toHaveAttribute('y1', path ?? '')
  await page.mouse.up()
  await expect
    .poll(async () => (await spatialEvidence(page)).document.topics['branch-b']?.children)
    .toContain('detail')
  await expect
    .poll(async () => (await spatialEvidence(page)).history.past)
    .toBe(original.history.past + 1)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await spatialEvidence(page)).document).toEqual(original.document)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect
    .poll(async () => (await spatialEvidence(page)).document.topics['branch-b']?.children)
    .toContain('detail')
})
