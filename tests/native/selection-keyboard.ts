import { browser } from '@wdio/globals'
import type { SpatialFrameDiagnostics, SpatialTestCanvas } from '@tests/native/independent-spatial'

/** Normal keyboard handlers; observe committed selection and real scene renders, not display FPS. */
export const sampleKeyboardSelection = async (mode: '2d' | '3d') =>
  browser.execute(async (view) => {
    const panel = document.getElementById('sheet-panel')
    if (!panel) throw new Error('Missing active sheet panel')
    panel.focus({ preventScroll: true })
    const canvas = document.querySelector<SpatialTestCanvas>('canvas[data-spatial-canvas="three"]')
    const selected = () =>
      view === '2d'
        ? document.querySelector<HTMLElement>('.react-flow__node-topic.selected')?.dataset.id
        : (
            canvas?.spatialFrameDiagnostics as
              | (SpatialFrameDiagnostics & {
                  input: { selectedId: string }
                })
              | undefined
          )?.input.selectedId
    const samples: {
      requested: string
      selected: string
      intervalMs: number
      dispatchMs: number
      rendered: boolean
    }[] = []
    const started = performance.now()
    let before = started
    let previousFrame = canvas?.spatialFrameDiagnostics.renderFrame ?? 0
    const frameGaps: number[] = []
    let previousRaf: number | undefined
    for (let index = 0; index < 40; index += 1) {
      if (
        !document.hasFocus() ||
        document.visibilityState !== 'visible' ||
        document.querySelector('[data-canvas-loading]')
      )
        throw new Error('Selection sampling requires a ready, visible and focused window')
      const key = index % 2 === 0 ? 'ArrowRight' : 'ArrowLeft'
      const requested = index % 2 === 0 ? 'topic-1' : 'root'
      const dispatchStarted = performance.now()
      panel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      const dispatchMs = performance.now() - dispatchStarted
      do {
        await new Promise<void>((resolve) =>
          requestAnimationFrame((now) => {
            if (previousRaf !== undefined) frameGaps.push(now - previousRaf)
            previousRaf = now
            resolve()
          }),
        )
        if (performance.now() - dispatchStarted > 3000)
          throw new Error('Selection did not reach its requested render')
      } while (
        selected() !== requested ||
        (view === '3d' && canvas?.spatialFrameDiagnostics.renderFrame === previousFrame)
      )
      const now = performance.now()
      const frame = canvas?.spatialFrameDiagnostics.renderFrame ?? 0
      samples.push({
        requested,
        selected: selected() ?? '',
        intervalMs: now - before,
        dispatchMs,
        rendered: view === '2d' || frame > previousFrame,
      })
      previousFrame = frame
      before = now
    }
    const durationMs = performance.now() - started
    const intervals = samples.map((sample) => sample.intervalMs).sort((a, b) => a - b)
    return {
      measurement:
        'synthetic keyboard selection-to-render latency, including offscreen reveal; not physical GPU FPS',
      durationMs,
      events: samples.length,
      eventRate: (samples.length * 1000) / durationMs,
      matched: samples.filter((sample) => sample.selected === sample.requested).length,
      rendered: samples.filter((sample) => sample.rendered).length,
      p50Ms: intervals[Math.floor(intervals.length * 0.5)] ?? 0,
      p95Ms: intervals[Math.floor(intervals.length * 0.95)] ?? 0,
      longFrames: frameGaps.filter((value) => value > 50).length,
      maxFrameGapMs: Math.max(0, ...frameGaps),
      maxGapMs: intervals.at(-1) ?? 0,
      samples,
    }
  }, mode)
