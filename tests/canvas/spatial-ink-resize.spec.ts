import { expect, test } from '@playwright/test'
import {
  clickSpatial,
  dragSpatialPoint,
  locatorBounds,
  openSpatial,
  spatialEvidence,
  spatialRect,
} from '@tests/canvas/spatial-test-geometry'

const ink = 'ink-spatial-ink'
test('single 3D ink resizes from all four corners at an oblique view, with fixed opposite corners, one undo and cancel', async ({
  page,
}) => {
  await openSpatial(page)
  await clickSpatial(page, ink)
  await expect(page.locator('[data-spatial-ink-resize]')).toBeVisible()
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
    const before = await spatialRect(page, ink)
    const state = await spatialEvidence(page)
    expect(Math.abs(state.view.yaw)).toBeGreaterThan(0.1)
    const button = page.getByTestId(`ink-resize-${corner}`)
    const box = await locatorBounds(button)
    const left = corner.endsWith('left'),
      top = corner.startsWith('top')
    await dragSpatialPoint(
      page,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      left ? -38 : 38,
      top ? -24 : 24,
    )
    await expect
      .poll(async () => (await spatialEvidence(page)).history.past)
      .toBe(state.history.past + 1)
    const after = await spatialRect(page, ink)
    expect(after.width).toBeGreaterThan(before.width + 30)
    expect(after.height).toBeGreaterThan(before.height + 18)
    expect(after.x + (left ? after.width : 0)).toBeCloseTo(before.x + (left ? before.width : 0), 0)
    expect(after.y + (top ? after.height : 0)).toBeCloseTo(before.y + (top ? before.height : 0), 0)
    const changed = (await spatialEvidence(page)).document.drawings?.[0]
    expect(changed?.points).toEqual(state.document.drawings?.[0]?.points)
    expect(changed?.spatialDepth).toBe(state.document.drawings?.[0]?.spatialDepth)
    await page.locator('#sheet-panel').focus()
    await page.keyboard.press('ControlOrMeta+z')
    await expect
      .poll(async () => (await spatialEvidence(page)).document.drawings)
      .toEqual(state.document.drawings)
    await expect.poll(async () => (await spatialRect(page, ink)).width).toBeCloseTo(before.width, 0)
    if (corner === 'top-left') {
      await page.keyboard.press('ControlOrMeta+Shift+z')
      await expect
        .poll(async () => (await spatialEvidence(page)).document.drawings?.[0])
        .toEqual(changed)
      await page.keyboard.press('ControlOrMeta+z')
      await expect
        .poll(async () => (await spatialEvidence(page)).document.drawings)
        .toEqual(state.document.drawings)
    }
  }
  const beforeCancel = await spatialEvidence(page)
  const box = await locatorBounds(page.getByTestId('ink-resize-bottom-right'))
  await dragSpatialPoint(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    50,
    35,
    true,
  )
  await expect
    .poll(async () => (await spatialEvidence(page)).document.drawings)
    .toEqual(beforeCancel.document.drawings)
  expect((await spatialEvidence(page)).history).toEqual(beforeCancel.history)
  await clickSpatial(page, 'branch-a', true)
  await expect(page.locator('[data-spatial-ink-resize]')).toHaveCount(0)
})
