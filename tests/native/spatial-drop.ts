import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { writeFile } from 'node:fs/promises'
import { nativeArtifact } from '@tests/native/artifacts'
import { observeDesktopSpatialDrag } from '@tests/native/desktop-pointer'
import { focusNativeWindow, shortcut } from '@tests/native/driver'
import {
  quietIndependentSpatial,
  readIndependentSpatial,
  waitIndependentSpatial,
} from '@tests/native/independent-spatial'
import { chooseSpatialDrop, type SpatialDropChoice } from '@tests/native/spatial-drop-geometry'
import {
  beginSpatialDropObservation,
  readSpatialDropObservation,
  stopSpatialDropObservation,
} from '@tests/native/spatial-drop-observer'

interface NativeSpatialDropOptions {
  readonly fixture: string
  readonly movingId: string
  readonly targetId: string
  readonly originalParent: string
  readonly currentParent: () => Promise<string | undefined>
}
const request = async (
  phase: 'cancel' | 'commit',
  status: string,
  choice: SpatialDropChoice,
): Promise<void> => {
  await writeFile(
    await nativeArtifact('brainstorming-desktop-drop-request.json'),
    JSON.stringify(
      {
        kind: 'early-drop',
        phase,
        status,
        choice,
        requestedAt: new Date().toISOString(),
        recommendedDurationMs: 10_000,
        instructions:
          'Use trusted desktop input. Drag to the requested visible halo, keep the button held until status permits release; never synthesize events or pointer capture.',
      },
      null,
      2,
    ),
  )
}

const observeDrop = async (options: NativeSpatialDropOptions, cancel: boolean) => {
  await focusNativeWindow()
  await quietIndependentSpatial()
  const phase = cancel ? 'cancel' : 'commit',
    choice = await chooseSpatialDrop(options.movingId, options.targetId)
  const initial = (await readIndependentSpatial()).rectangles.find(
    (rect) => rect.id === options.movingId,
  )
  if (!initial) throw new Error('Missing initial actual Three rectangle')
  expect(await options.currentParent()).toBe(options.originalParent)
  await beginSpatialDropObservation(choice)
  await request(phase, 'preparing-observers', choice)
  try {
    await request(phase, 'awaiting-trusted-pointer', choice)
    const result = await observeDesktopSpatialDrag(choice, {
      onHeld: async () => {
        await browser.waitUntil(
          async () => {
            const observation = await readSpatialDropObservation()
            if (observation.releasedAt !== null && !observation.snapshot)
              throw new Error('Desktop pointer released before an early predicted drop appeared')
            return observation.snapshot !== null
          },
          {
            interval: 10,
            timeout: 120_000,
            timeoutMsg: 'Awaiting the trusted desktop drag and an actual early-drop preview',
          },
        )
        const held = await readSpatialDropObservation()
        const snapshot = held.snapshot
        if (!snapshot) throw new Error('The live drop snapshot disappeared')
        // A physical release before these assertions is an acceptance failure.
        expect(held.releasedAt).toBeNull()
        expect(snapshot.changed).toBe(true)
        expect(snapshot.gap).toBeGreaterThan(12)
        expect(snapshot.predicted).toBe('true')
        expect(snapshot.parentId).toBe(options.targetId)
        expect(snapshot.lineParentId).toBe(options.targetId)
        expect(
          snapshot.line.split(',').every((value) => value !== '' && Number.isFinite(Number(value))),
        ).toBe(true)
        const parentDuringPreview = options.currentParent()
        if (cancel) {
          // Key delivery is WDIO's actual keyboard endpoint; no KeyboardEvent is constructed here.
          await browser.keys(Key.Escape)
          await expect(browser.$('[data-testid="drop-preview"]')).not.toExist()
          expect(await parentDuringPreview).toBe(options.originalParent)
          expect((await readSpatialDropObservation()).releasedAt).toBeNull()
          await request(phase, 'escape-confirmed-release-pointer', choice)
        } else {
          expect(await parentDuringPreview).toBe(options.originalParent)
          await browser.saveScreenshot(
            await nativeArtifact('brainstorming-native-3d-drop-preview.png'),
          )
          expect((await readSpatialDropObservation()).releasedAt).toBeNull()
          await request(phase, 'preview-confirmed-release-pointer', choice)
        }
      },
    })
    const snapshot = (await readSpatialDropObservation()).snapshot
    if (!snapshot) throw new Error('Missing early-drop snapshot after native input')
    expect(result.trusted).toBe(true)
    expect(result.captured).toBe(true)
    expect(result.events).toBeGreaterThan(0)
    await writeFile(
      await nativeArtifact(`brainstorming-native-3d-drop-${phase}.json`),
      JSON.stringify(
        { fixture: options.fixture, choice, preview: snapshot, desktop: result },
        null,
        2,
      ),
    )
    await expect(browser.$('[data-testid="drop-preview"]')).not.toExist()
    if (cancel) {
      expect(await options.currentParent()).toBe(options.originalParent)
      await browser.waitUntil(
        async () => {
          const rect = (await readIndependentSpatial()).rectangles.find(
            (item) => item.id === options.movingId,
          )
          return Boolean(rect && Math.hypot(rect.x - initial.x, rect.y - initial.y) < 0.5)
        },
        { timeoutMsg: 'Escape did not restore the actual Three topic position' },
      )
    }
    await request(phase, 'complete', choice)
  } catch (error) {
    await request(phase, 'failed-do-not-send-more-input', choice)
    throw error
  } finally {
    await stopSpatialDropObservation()
  }
}

/** Preserve native preview/cancel/persistence/undo assertions using observed trusted OS input. */
export const verifyNativeSpatialDrop = async (options: NativeSpatialDropOptions): Promise<void> => {
  await waitIndependentSpatial()
  await observeDrop(options, true)
  await browser.saveScreenshot(await nativeArtifact('brainstorming-native-3d-drop-cancelled.png'))
  await observeDrop(options, false)
  await browser.waitUntil(async () => (await options.currentParent()) === options.targetId)
  await expect(
    browser.$(`[data-testid="drop-preview-connection-${options.movingId}"]`),
  ).not.toExist()
  await shortcut('z')
  await browser.waitUntil(async () => (await options.currentParent()) === options.originalParent)
  await focusNativeWindow()
  await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Control, Key.Shift, 'z'])
  await browser.waitUntil(async () => (await options.currentParent()) === options.targetId)
}
