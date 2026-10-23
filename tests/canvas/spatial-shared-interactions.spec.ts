import { expect, test, type Locator } from '@playwright/test'
import {
  clickSpatial,
  dragSpatialPoint,
  locatorBounds,
  openSpatial,
  spatialEvidence,
  spatialPoint,
  spatialRect,
} from '@tests/canvas/spatial-test-geometry'

const pathPoints = async (path: Locator) =>
  path.evaluate((element) => {
    if (!(element instanceof SVGPathElement)) throw new Error('Missing actual relation path')
    const length = element.getTotalLength()
    return [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
      const point = element.getPointAtLength(length * fraction)
      return { x: point.x, y: point.y }
    })
  })

test('3D manual relation control drag persists its geometry and one undo restores it', async ({
  page,
}) => {
  await openSpatial(page)
  const before = (await spatialEvidence(page)).document.relations?.[0]
  const path = page.getByTestId('relation-body-spatial-relation')
  const originalPath = await path.getAttribute('d'),
    originalPoints = await pathPoints(path)
  expect(originalPath).toBeTruthy()
  await page.getByRole('button', { name: '关联线：互相支持', exact: true }).click()
  const control = page.getByTestId('relation-control-spatial-relation-0')
  const grip = await locatorBounds(control)
  await dragSpatialPoint(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 70, -65)
  await expect
    .poll(async () => (await spatialEvidence(page)).document.relations?.[0])
    .not.toEqual(before)
  await expect(path).not.toHaveAttribute('d', originalPath ?? '')
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect
    .poll(async () => (await spatialEvidence(page)).document.relations?.[0])
    .toEqual(before)
  await expect
    .poll(async () => {
      const restored = await pathPoints(path)
      return Math.max(
        ...restored.map((point, index) =>
          Math.hypot(
            point.x - (originalPoints[index]?.x ?? Infinity),
            point.y - (originalPoints[index]?.y ?? Infinity),
          ),
        ),
      )
    })
    .toBeLessThan(0.1)
})

test('3D moves a selected topic subtree and ink together and undoes both once', async ({
  page,
}) => {
  await openSpatial(page)
  const ids = ['branch-a', 'detail', 'ink-spatial-ink']
  const before = await Promise.all(ids.map((id) => spatialRect(page, id)))
  const root = await spatialRect(page, 'root'),
    document = (await spatialEvidence(page)).document
  await clickSpatial(page, 'branch-a')
  await clickSpatial(page, 'ink-spatial-ink', true)
  await expect.poll(async () => (await spatialEvidence(page)).selected).toEqual(['branch-a'])
  await expect
    .poll(async () => (await spatialEvidence(page)).selectedDrawings)
    .toEqual(['spatial-ink'])
  const past = (await spatialEvidence(page)).history.past
  await dragSpatialPoint(page, await spatialPoint(page, 'branch-a'), 75, 40)
  for (const rect of before)
    await expect
      .poll(async () => {
        const after = await spatialRect(page, rect.id)
        return Math.hypot(after.x - rect.x, after.y - rect.y)
      })
      .toBeGreaterThan(20)
  await expect.poll(async () => (await spatialRect(page, 'root')).x).toBeCloseTo(root.x, 0)
  await expect.poll(async () => (await spatialEvidence(page)).history.past).toBe(past + 1)
  const moved = (await spatialEvidence(page)).document
  expect(moved.topics['branch-a']?.children).toEqual(document.topics['branch-a']?.children)
  expect(moved.drawings).not.toEqual(document.drawings)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await spatialEvidence(page)).document).toEqual(document)
  for (const rect of before) {
    await expect.poll(async () => (await spatialRect(page, rect.id)).x).toBeCloseTo(rect.x, 0)
    await expect.poll(async () => (await spatialRect(page, rect.id)).y).toBeCloseTo(rect.y, 0)
  }
})
