import { browser } from '@wdio/globals'
import type { DenseEdgeGpuCanvas } from '@renderer/lib/denseEdgeGpuTypes'

interface Point {
  readonly x: number
  readonly y: number
}

/** tauri-plugin-wdio-webdriver 1.5.0 omits MouseEvent.view and held buttons on moves, which D3 drag requires.
 * Exercise that WebKit event contract here; tests/canvas retains real pointer hit-testing.
 * This helper never calls editor commands or bypasses a loading/selection guard.
 */
export const previewNativeCanvasDrag = async (
  start: Point,
  end: Point,
  id = 'root',
  frameCount = 30,
  eventsPerFrame = 1,
) =>
  browser.execute(
    async ({ start, end, id, frameCount, eventsPerFrame }) => {
      if (!Number.isInteger(eventsPerFrame) || eventsPerFrame < 1)
        throw new Error('Drag sampling requires a positive integer event burst')
      if (document.visibilityState !== 'visible' || !document.hasFocus())
        throw new Error('Native drag sampling requires a visible and focused window')
      const target = document.elementFromPoint(start.x, start.y)
      if (target?.closest('.react-flow__node')?.getAttribute('data-id') !== id)
        throw new Error('Drag must hit the expected topic body')
      if (target.closest('.nodrag')) throw new Error('Drag must not hit a resize control')
      if (document.querySelector('[data-canvas-loading]')) throw new Error('Canvas is not ready')
      const node = target.closest<HTMLElement>('.react-flow__node')
      if (!node) throw new Error('Missing topic wrapper')
      const gpu = document.querySelector<DenseEdgeGpuCanvas>('canvas[data-gpu-edge-ready="true"]')
      const initialGpuFrame = gpu?.edgeDiagnostics?.frame ?? 0
      const initial = node.style.transform
      const initialRect = node.getBoundingClientRect()
      target.dispatchEvent(
        new PointerEvent('pointerdown', {
          view: window,
          bubbles: true,
          cancelable: true,
          pointerType: 'mouse',
          pointerId: 1,
          button: 0,
          buttons: 1,
          clientX: start.x,
          clientY: start.y,
        }),
      )
      target.dispatchEvent(
        new MouseEvent('mousedown', {
          view: window,
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: start.x,
          clientY: start.y,
        }),
      )
      // Preserve the real pointer→compatibility-mouse sequence, including camera motion freeze.
      const move = (x: number, y: number) => {
        const point = {
          view: window,
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: x,
          clientY: y,
        }
        window.dispatchEvent(
          new PointerEvent('pointermove', {
            ...point,
            pointerType: 'mouse',
            pointerId: 1,
          }),
        )
        window.dispatchEvent(new MouseEvent('mousemove', point))
      }
      // Cross D3's activation threshold before the long path, preserving the grab offset.
      move(start.x + 5, start.y)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          resolve()
        }),
      )
      const frames: number[] = []
      const dispatchTimes: number[] = []
      let previous = performance.now()
      const started = previous
      let previousTransform = node.style.transform
      const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
      let previousViewport = viewport?.style.transform
      let updatedFrames = 0
      let viewportUpdatedFrames = 0
      const observeFrame = async () => {
        const now = await new Promise<number>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            cancelAnimationFrame(frame)
            reject(new Error('Native drag sampling stopped; keep the window visible'))
          }, 2000)
          const frame = requestAnimationFrame((time) => {
            clearTimeout(timeout)
            if (document.visibilityState !== 'visible' || !document.hasFocus())
              reject(new Error('Native drag sampling window must remain visible and focused'))
            else resolve(time)
          })
        })
        if (node.style.transform !== previousTransform) updatedFrames += 1
        if (viewport?.style.transform !== previousViewport) viewportUpdatedFrames += 1
        previousTransform = node.style.transform
        previousViewport = viewport?.style.transform
        frames.push(now - previous)
        previous = now
      }
      for (let index = 0; index < frameCount; index += 1) {
        await observeFrame()
        const dispatchStarted = performance.now()
        for (let event = 1; event <= eventsPerFrame; event += 1) {
          const progress = (index + event / eventsPerFrame) / frameCount
          move(start.x + (end.x - start.x) * progress, start.y + (end.y - start.y) * progress)
        }
        dispatchTimes.push(performance.now() - dispatchStarted)
      }
      // Observe the final input's committed geometry before releasing the held button.
      await observeFrame()
      if (
        !node.classList.contains('dragging') ||
        !document.querySelector('.canvas[data-node-dragging]')
      )
        throw new Error(
          `The sampled node drag was cancelled or resized: ${JSON.stringify({ className: node.className, initial, final: node.style.transform, canvasDragging: document.querySelector('.canvas')?.getAttribute('data-node-dragging'), focused: document.hasFocus(), target: target.tagName })}`,
        )
      frames.sort((a, b) => a - b)
      const durationMs = performance.now() - started
      const finalRect = node.getBoundingClientRect()
      return {
        measurement: 'synthetic WebView drag render throughput; not physical GPU FPS',
        renderer:
          gpu?.dataset.gpuEdgeReady === 'true' &&
          gpu.parentElement?.dataset.gpuEdgeActive === 'true'
            ? 'webgl'
            : 'svg',
        gpuFrames: (gpu?.edgeDiagnostics?.frame ?? 0) - initialGpuFrame,
        width: innerWidth,
        height: innerHeight,
        ratio: devicePixelRatio,
        zoom: viewport ? new DOMMatrix(getComputedStyle(viewport).transform).a : null,
        changed: initial !== node.style.transform,
        mounted: document.querySelectorAll('.react-flow__node-topic').length,
        fps: (frames.length * 1000) / frames.reduce((sum, value) => sum + value, 0),
        p95: frames[Math.floor(frames.length * 0.95)],
        rafFrames: frames.length,
        updatedFrames,
        updatesFps: (updatedFrames * 1000) / frames.reduce((sum, value) => sum + value, 0),
        viewportUpdatedFrames,
        viewportUpdatesFps: (viewportUpdatedFrames * 1000) / durationMs,
        eventsPerFrame,
        eventCount: frameCount * eventsPerFrame,
        eventRate: (frameCount * eventsPerFrame * 1000) / durationMs,
        durationMs,
        p50: frames[Math.floor(frames.length * 0.5)],
        p99: frames[Math.floor(frames.length * 0.99)],
        longFrames: frames.filter((interval) => interval > 50).length,
        maxGapMs: frames.at(-1),
        dispatchMs: dispatchTimes.reduce((sum, value) => sum + value, 0),
        maxDispatchMs: Math.max(0, ...dispatchTimes),
        screenDelta: { x: finalRect.x - initialRect.x, y: finalRect.y - initialRect.y },
        expectedDelta: { x: end.x - start.x, y: end.y - start.y },
      }
    },
    { start, end, id, frameCount, eventsPerFrame },
  )

export const finishNativeCanvasDrag = async (point: Point) =>
  browser.execute(({ x, y }) => {
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        view: window,
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
        pointerId: 1,
        button: 0,
        buttons: 0,
        clientX: x,
        clientY: y,
      }),
    )
    window.dispatchEvent(
      new MouseEvent('mouseup', {
        view: window,
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
        clientX: x,
        clientY: y,
      }),
    )
  }, point)
