import { expect, test } from '@playwright/test'
import {
  clickSpatial,
  dragSpatialPoint,
  emptySpatialPoint,
  locatorBounds,
  openSpatial,
  settledSpatialRect,
  spatialEvidence,
  spatialRect,
} from '@tests/canvas/spatial-test-geometry'

const corners = [
  { name: 'top-left', index: 0, dx: -65, dy: -35 },
  { name: 'top-right', index: 1, dx: 65, dy: -35 },
  { name: 'bottom-left', index: 2, dx: -65, dy: 35 },
  { name: 'bottom-right', index: 3, dx: 65, dy: 35 },
] as const
for (const corner of corners) {
  test(`3D ${corner.name} grip scales the topic and one undo restores it`, async ({ page }) => {
    await openSpatial(page)
    await clickSpatial(page, 'branch-a')
    const before = await spatialRect(page, 'branch-a'),
      document = (await spatialEvidence(page)).document
    const grip = await locatorBounds(page.locator('[data-spatial-scale] button').nth(corner.index))
    await dragSpatialPoint(
      page,
      { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
      corner.dx,
      corner.dy,
    )
    await expect
      .poll(async () => (await spatialRect(page, 'branch-a')).width)
      .toBeGreaterThan(before.width + 25)
    const after = await spatialRect(page, 'branch-a')
    expect(after.height / before.height, `${corner.name} aspect ratio`).toBeCloseTo(
      after.width / before.width,
      1,
    )
    await page.locator('#sheet-panel').focus()
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await spatialEvidence(page)).document).toEqual(document)
    await expect
      .poll(async () => (await spatialRect(page, 'branch-a')).width)
      .toBeCloseTo(before.width, 0)
    await expect
      .poll(async () => (await spatialRect(page, 'branch-a')).height)
      .toBeCloseTo(before.height, 0)
  })
}

test('empty-canvas orbit commits once and Escape cancels without changing selection or history', async ({
  page,
}) => {
  await openSpatial(page)
  await clickSpatial(page, 'branch-a')
  const before = await settledSpatialRect(page, 'branch-a'),
    original = await spatialEvidence(page)
  const point = await emptySpatialPoint(page)
  await dragSpatialPoint(page, point, 120, 70)
  await expect.poll(async () => (await spatialEvidence(page)).view.yaw).not.toBe(original.view.yaw)
  const changed = await settledSpatialRect(page, 'branch-a')
  expect(Math.hypot(changed.x - before.x, changed.y - before.y)).toBeGreaterThan(1)
  await expect
    .poll(async () => (await spatialEvidence(page)).history.past)
    .toBe(original.history.past + 1)
  expect((await spatialEvidence(page)).selected).toEqual(['branch-a'])
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await spatialRect(page, 'branch-a')).x).toBeCloseTo(before.x, 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await spatialRect(page, 'branch-a')).x).toBeCloseTo(changed.x, 0)
  await settledSpatialRect(page, 'branch-a')
  const committed = await spatialEvidence(page),
    committedRect = await spatialRect(page, 'branch-a')
  await dragSpatialPoint(page, await emptySpatialPoint(page), -70, -50, true)
  await expect.poll(async () => (await spatialEvidence(page)).document).toEqual(committed.document)
  await expect
    .poll(async () => (await spatialRect(page, 'branch-a')).x)
    .toBeCloseTo(committedRect.x, 0)
  await expect
    .poll(async () => (await spatialRect(page, 'branch-a')).y)
    .toBeCloseTo(committedRect.y, 0)
  expect((await spatialEvidence(page)).history).toEqual(committed.history)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await spatialRect(page, 'branch-a')).x).toBeCloseTo(before.x, 0)
})
