import { selectIndependentTopicFromOutline } from '@tests/native/spatial-outline'
import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  editor,
  fillContentEditable,
  focusNativeWindow,
  named,
  readDocument,
  shortcut,
} from '@tests/native/driver'
import {
  chooseIndependentDrag,
  openIndependentFixture,
  quietIndependentSpatial,
  readIndependentSpatial,
  waitIndependentSpatial,
} from '@tests/native/independent-spatial'
import { dragIndependentSpatialReal } from '@tests/native/independent-spatial-drag'
import { sampleIndependentSpatialNavigation } from '@tests/native/independent-spatial-navigation'

it('confirms Chinese title editing, creates child/sibling topics, uses real pointer dragging and restores its own 3D camera', async () => {
  const fixture = await openIndependentFixture(1)
  const rootId = fixture.document.rootId
  await selectIndependentTopicFromOutline('性能测试')
  await browser.keys(Key.F2)
  await expect(editor()).toBeFocused()
  await fillContentEditable(editor(), '独立三维中文标题')
  await browser.keys(Key.Enter)
  await expect(editor()).not.toExist()
  await browser.waitUntil(
    async () =>
      (await readDocument(fixture.name)).sheets[0]?.document.topics[rootId]?.title ===
      '独立三维中文标题',
  )
  expect(
    Object.keys((await readDocument(fixture.name)).sheets[0]?.document.topics ?? {}),
  ).toHaveLength(1)
  await browser.keys(Key.Tab)
  await expect(editor()).toBeFocused()
  await fillContentEditable(editor(), '三维子主题')
  await browser.keys(Key.Enter)
  await expect(editor()).not.toExist()
  await browser.waitUntil(
    async () =>
      Object.keys((await readDocument(fixture.name)).sheets[0]?.document.topics ?? {}).length === 2,
  )
  await browser.keys(Key.Enter)
  await expect(editor()).toBeFocused()
  await fillContentEditable(editor(), '三维同级主题')
  await browser.keys(Key.Enter)
  await expect(editor()).not.toExist()
  await browser.waitUntil(
    async () =>
      Object.keys((await readDocument(fixture.name)).sheets[0]?.document.topics ?? {}).length === 3,
  )
  const created = (await readDocument(fixture.name)).sheets[0]?.document
  if (!created) throw new Error('Missing saved independent 3D document')
  const child = Object.values(created.topics).find((topic) => topic.title === '三维子主题')
  const sibling = Object.values(created.topics).find((topic) => topic.title === '三维同级主题')
  if (!child || !sibling)
    throw new Error('Native child/sibling editing did not save Chinese titles')
  expect(created.topics[rootId]?.children).toEqual([child.id, sibling.id])
  await waitIndependentSpatial()
  await named('适应画布').click()
  await quietIndependentSpatial()
  const choice = await chooseIndependentDrag([child.id, sibling.id])
  await dragIndependentSpatialReal(choice)
  await browser.waitUntil(async () => {
    const topic = (await readDocument(fixture.name)).sheets[0]?.document.topics[choice.id]
    return Math.abs(topic?.style?.offsetX ?? 0) + Math.abs(topic?.style?.offsetY ?? 0) > 1
  })
  expect((await readDocument(fixture.name)).sheets[0]?.document.topics[rootId]?.children).toEqual([
    child.id,
    sibling.id,
  ])
  await shortcut('z')
  await browser.waitUntil(async () => {
    const topic = (await readDocument(fixture.name)).sheets[0]?.document.topics[choice.id]
    return (topic?.style?.offsetX ?? 0) === 0 && (topic?.style?.offsetY ?? 0) === 0
  })
  await focusNativeWindow()
  await sampleIndependentSpatialNavigation(1)
  await quietIndependentSpatial()
  const before = await readIndependentSpatial()
  await named('二维视图').click()
  await expect(browser.$('[data-view-mode="2d"]')).toBeDisplayed()
  await expect(browser.$('[data-canvas-loading]')).not.toExist()
  await named('三维视图').click()
  await waitIndependentSpatial()
  await quietIndependentSpatial()
  const restored = await readIndependentSpatial()
  for (const [index, value] of (before.camera?.position ?? []).entries())
    expect(restored.camera?.position[index]).toBeCloseTo(value, 4)
  for (const [index, value] of (before.camera?.quaternion ?? []).entries())
    expect(restored.camera?.quaternion[index]).toBeCloseTo(value, 6)
  // Damping can settle a few millionths of a world unit later on remount.
  // Also verify every projected card returns to the same subpixel location.
  for (const rect of before.rectangles) {
    const next = restored.rectangles.find((item) => item.id === rect.id)
    expect(next).toBeDefined()
    for (const dimension of ['x', 'y', 'width', 'height'] as const)
      expect(Math.abs((next?.[dimension] ?? Infinity) - rect[dimension])).toBeLessThan(0.1)
  }
  expect(restored.topicCount).toBe(3)
  await browser.saveScreenshot(
    await nativeArtifact('brainstorming-independent-spatial-correctness.png'),
  )
})
