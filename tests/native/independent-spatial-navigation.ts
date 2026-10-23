import { browser } from '@wdio/globals'
import type { SpatialTestCanvas } from '@tests/native/independent-spatial'

/** Sample real camera matrices and WebGL render counters; callback delivery alone is insufficient. */
export const sampleIndependentSpatialNavigation = async (eventsPerFrame: 1 | 4) =>
  browser.execute(async (burst) => {
    const canvas = document.querySelector<SpatialTestCanvas>('canvas[data-spatial-canvas="three"]')
    if (!canvas?.spatialFrameDiagnostics.camera)
      throw new Error('Missing cheap native camera diagnostics')
    const bounds = canvas.getBoundingClientRect()
    const initial = canvas.spatialFrameDiagnostics
    let matrix = initial.camera?.matrix.join(',')
    let renderFrame = initial.renderFrame
    const frames: {
      intervalMs: number
      cameraChanged: boolean
      rendered: boolean
      renderDelta: number
      dispatchMs: number
      kind: 'pan' | 'zoom'
    }[] = []
    let previous = performance.now()
    const started = previous
    let sent = false
    let dispatchMs = 0
    let kind: 'pan' | 'zoom' = 'pan'
    await new Promise<void>((resolve, reject) => {
      let raf = 0
      const timeout = window.setTimeout(() => {
        cancelAnimationFrame(raf)
        reject(new Error('Independent navigation sampling stalled'))
      }, 10_000)
      const tick = (now: number) => {
        if (
          document.visibilityState !== 'visible' ||
          !document.hasFocus() ||
          document.querySelector('[data-canvas-loading]')
        ) {
          clearTimeout(timeout)
          reject(new Error('Sampling requires the focused, visible, ready native canvas'))
          return
        }
        const current = canvas.spatialFrameDiagnostics
        const nextMatrix = current.camera?.matrix.join(',')
        if (sent)
          frames.push({
            intervalMs: now - previous,
            cameraChanged: nextMatrix !== matrix,
            rendered: current.renderFrame !== renderFrame,
            renderDelta: current.renderFrame - renderFrame,
            dispatchMs,
            kind,
          })
        previous = now
        matrix = nextMatrix
        renderFrame = current.renderFrame
        if (now - started >= 4000) {
          clearTimeout(timeout)
          resolve()
          return
        }
        const phase = Math.floor((now - started) / 300)
        kind = phase % 2 === 0 ? 'pan' : 'zoom'
        const sign = Math.floor(phase / 2) % 2 === 0 ? 1 : -1
        const startDispatch = performance.now()
        for (let packet = 0; packet < burst; packet++)
          canvas.dispatchEvent(
            new WheelEvent('wheel', {
              view: window,
              bubbles: true,
              cancelable: true,
              deltaX: kind === 'pan' ? (sign * 3) / burst : 0,
              deltaY: kind === 'zoom' ? (sign * 1.2) / burst : 0,
              ctrlKey: kind === 'zoom',
              clientX: bounds.left + bounds.width / 2,
              clientY: bounds.top + bounds.height / 2,
            }),
          )
        dispatchMs = performance.now() - startDispatch
        sent = true
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    const durationMs = performance.now() - started
    const intervals = frames.map((frame) => frame.intervalMs).sort((a, b) => a - b)
    const cameraUpdates = frames.filter((frame) => frame.cameraChanged).length
    const renderedUpdates = frames.filter((frame) => frame.cameraChanged && frame.rendered).length
    return {
      measurement:
        'synthetic WebView input throughput with actual Three camera and WebGL renders; not physical presentation FPS',
      eventsPerFrame: burst,
      durationMs,
      packets: frames.length * burst,
      rafFps: (frames.length * 1000) / durationMs,
      cameraUpdates,
      renderedUpdates,
      cameraUpdatesFps: (cameraUpdates * 1000) / durationMs,
      renderedUpdatesFps: (renderedUpdates * 1000) / durationMs,
      p95Ms: intervals[Math.floor(intervals.length * 0.95)] ?? 0,
      actualRenderFrames: frames.reduce((sum, frame) => sum + frame.renderDelta, 0),
      panUpdates: frames.filter((frame) => frame.kind === 'pan' && frame.cameraChanged).length,
      zoomUpdates: frames.filter((frame) => frame.kind === 'zoom' && frame.cameraChanged).length,
      initial,
      final: canvas.spatialFrameDiagnostics,
      frames,
    }
  }, eventsPerFrame)
