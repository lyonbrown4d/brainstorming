import { browser, expect } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { nativeArtifact } from '@tests/native/artifacts'
import { focusNativeWindow, readDocument, shortcut } from '@tests/native/driver'
import {
  chooseIndependentDrag,
  openIndependentFixture,
  quietIndependentSpatial,
  readIndependentSpatial,
} from '@tests/native/independent-spatial'
import { sampleIndependentSpatialNavigation } from '@tests/native/independent-spatial-navigation'
import { sampleIndependentSpatialDrag } from '@tests/native/independent-spatial-drag'

it('renders real independent camera changes under input bursts and moves a thousand-topic leaf with one undo', async () => {
  const fixture = await openIndependentFixture(1000)
  expect((await readIndependentSpatial()).topicCount).toBe(1000)
  const navigation: Awaited<ReturnType<typeof sampleIndependentSpatialNavigation>>[] = []
  const persist = async (drag?: Awaited<ReturnType<typeof sampleIndependentSpatialDrag>>) => {
    await writeFile(
      await nativeArtifact('brainstorming-independent-spatial-performance.json'),
      JSON.stringify({ navigation, drag }, null, 2),
    )
  }
  for (const burst of [1, 4] as const) {
    await focusNativeWindow()
    await quietIndependentSpatial()
    const result = await sampleIndependentSpatialNavigation(burst)
    navigation.push(result)
    await persist()
    expect(result.durationMs).toBeGreaterThanOrEqual(4000)
    expect(result.cameraUpdates).toBeGreaterThan(0)
    expect(result.renderedUpdates).toBeGreaterThan(0)
    expect(result.actualRenderFrames).toBeGreaterThan(0)
    expect(result.panUpdates).toBeGreaterThan(0)
    expect(result.zoomUpdates).toBeGreaterThan(0)
    expect(result.p95Ms).toBeGreaterThan(0)
    expect(result.final.camera?.matrix).not.toEqual(result.initial.camera?.matrix)
    await expect(browser.$('.react-flow__node')).not.toExist()
  }
  await quietIndependentSpatial()
  const leaves = Object.values(fixture.document.topics)
    .filter((topic) => !topic.children.length)
    .map((topic) => topic.id)
  const choice = await chooseIndependentDrag(leaves)
  const original = fixture.document.topics[choice.id]
  const parent = Object.values(fixture.document.topics).find((topic) =>
    topic.children.includes(choice.id),
  )
  const drag = await sampleIndependentSpatialDrag(choice)
  await persist(drag)
  expect(drag.renderedUpdates).toBeGreaterThan(0)
  expect(Math.hypot(drag.screenDelta.x, drag.screenDelta.y)).toBeGreaterThan(100)
  expect(drag.screenDelta.x).toBeCloseTo(choice.end.x - choice.start.x, 0)
  expect(drag.screenDelta.y).toBeCloseTo(choice.end.y - choice.start.y, 0)
  await browser.waitUntil(async () => {
    const moved = (await readDocument(fixture.name)).sheets[0]?.document.topics[choice.id]
    return (
      Math.abs((moved?.style?.offsetX ?? 0) - (original?.style?.offsetX ?? 0)) +
        Math.abs((moved?.style?.offsetY ?? 0) - (original?.style?.offsetY ?? 0)) >
      1
    )
  })
  const moved = (await readDocument(fixture.name)).sheets[0]?.document
  expect(Object.keys(moved?.topics ?? {})).toHaveLength(1000)
  expect(moved?.topics[parent?.id ?? '']?.children).toEqual(parent?.children)
  expect(moved?.topics[choice.id]?.children).toEqual(original?.children)
  await shortcut('z')
  await browser.waitUntil(async () => {
    const restored = (await readDocument(fixture.name)).sheets[0]?.document.topics[choice.id]
    return (
      (restored?.style?.offsetX ?? 0) === (original?.style?.offsetX ?? 0) &&
      (restored?.style?.offsetY ?? 0) === (original?.style?.offsetY ?? 0)
    )
  })
  await browser.saveScreenshot(
    await nativeArtifact('brainstorming-independent-spatial-performance.png'),
  )
})
