import { browser, expect } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { nativeArtifact } from '@tests/native/artifacts'
import { focusNativeWindow, named, readDocument, shortcut } from '@tests/native/driver'
import {
  chooseIndependentDrag,
  openIndependentFixture,
  quietIndependentSpatial,
} from '@tests/native/independent-spatial'
import { sampleIndependentSpatialDrag } from '@tests/native/independent-spatial-drag'

it('moves the complete independent thousand-topic scene with one saved command and one undo', async () => {
  const fixture = await openIndependentFixture(1000)
  await named('适应画布').click()
  await focusNativeWindow()
  await quietIndependentSpatial()
  const choice = await chooseIndependentDrag([fixture.document.rootId])
  const drag = await sampleIndependentSpatialDrag(choice)
  await writeFile(
    await nativeArtifact('brainstorming-independent-spatial-group-performance.json'),
    JSON.stringify(drag, null, 2),
  )
  expect(drag.renderedUpdates).toBeGreaterThan(0)
  expect(drag.screenDelta.x).toBeCloseTo(choice.end.x - choice.start.x, 0)
  expect(drag.screenDelta.y).toBeCloseTo(choice.end.y - choice.start.y, 0)
  await browser.waitUntil(
    async () =>
      Math.abs(
        (await readDocument(fixture.name)).sheets[0]?.document.topics.root?.style?.offsetX ?? 0,
      ) > 1,
  )
  const moved = (await readDocument(fixture.name)).sheets[0]?.document
  expect(Object.keys(moved?.topics ?? {})).toHaveLength(1000)
  expect(moved?.topics.root?.children).toEqual(fixture.document.topics.root?.children)
  await shortcut('z')
  await browser.waitUntil(
    async () =>
      ((await readDocument(fixture.name)).sheets[0]?.document.topics.root?.style?.offsetX ?? 0) ===
      0,
  )
})
