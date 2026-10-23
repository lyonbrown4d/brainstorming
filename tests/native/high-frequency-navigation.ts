import { browser } from '@wdio/globals'

/** Synthetic WebView render throughput: RAF delivery is not physical GPU presentation FPS. */
export const sampleHighFrequencyNavigation = async (eventsPerFrame: 1 | 4) =>
  browser.execute(async (burst) => {
    const pane = document.querySelector('.react-flow__pane')
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
    if (!pane || !viewport) throw new Error('Missing native canvas geometry')
    const center = pane.getBoundingClientRect()
    const node = [...document.querySelectorAll<HTMLElement>('.react-flow__node-topic')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(
        ({ rect }) =>
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left > center.left + 80 &&
          rect.right < center.right - 80 &&
          rect.top > center.top + 80 &&
          rect.bottom < center.bottom - 80,
      )
      .sort(
        (a, b) =>
          Math.hypot(
            a.rect.x + a.rect.width / 2 - center.x - center.width / 2,
            a.rect.y + a.rect.height / 2 - center.y - center.height / 2,
          ) -
          Math.hypot(
            b.rect.x + b.rect.width / 2 - center.x - center.width / 2,
            b.rect.y + b.rect.height / 2 - center.y - center.height / 2,
          ),
      )[0]?.element
    if (!node) throw new Error('Navigation sampling requires a topic inside the canvas')
    const geometry = () => {
      if (!node.isConnected) throw new Error('The sampled topic left the visible canvas')
      const rect = node.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const initial = geometry()
    let previousGeometry = initial
    let previousViewport = viewport.style.transform
    let previousProjection = node.style.transform
    const frames: {
      phase: number
      kind: 'pan' | 'zoom'
      intervalMs: number
      dispatchMs: number
      events: number
      nodeChanged: boolean
      viewportChanged: boolean
      projectionChanged: boolean
      panChanged: boolean
      zoomChanged: boolean
    }[] = []
    let last = performance.now()
    const started = last
    let sentPhase = 0
    let sentKind: 'pan' | 'zoom' = 'pan'
    let dispatchMs = 0
    let eventCount = 0
    let deltaX = 0
    let deltaY = 0
    await new Promise<void>((resolve, reject) => {
      let frame = 0
      const timeout = window.setTimeout(() => {
        cancelAnimationFrame(frame)
        reject(new Error('High-frequency navigation stopped producing frames'))
      }, 10_000)
      const tick = (now: number) => {
        if (
          document.visibilityState !== 'visible' ||
          !document.hasFocus() ||
          document.querySelector('[data-canvas-loading]')
        ) {
          clearTimeout(timeout)
          reject(new Error('Sampling requires a ready, visible and focused native window'))
          return
        }
        const current = geometry()
        const panChanged =
          Math.hypot(current.x - previousGeometry.x, current.y - previousGeometry.y) > 0.01
        const zoomChanged =
          Math.abs(current.width - previousGeometry.width) +
            Math.abs(current.height - previousGeometry.height) >
          0.01
        if (eventCount)
          frames.push({
            phase: sentPhase,
            kind: sentKind,
            intervalMs: now - last,
            dispatchMs,
            events: eventCount,
            nodeChanged: panChanged || zoomChanged,
            viewportChanged: viewport.style.transform !== previousViewport,
            projectionChanged: node.style.transform !== previousProjection,
            panChanged,
            zoomChanged,
          })
        previousGeometry = current
        previousViewport = viewport.style.transform
        previousProjection = node.style.transform
        last = now
        if (now - started >= 4000) {
          clearTimeout(timeout)
          resolve()
          return
        }
        sentPhase = Math.floor((now - started) / 300)
        sentKind = sentPhase % 2 === 0 ? 'pan' : 'zoom'
        // Four events carry exactly the same per-frame impulse as the single-event control.
        const sign = Math.floor(sentPhase / 2) % 2 === 0 ? 1 : -1
        const x = sentKind === 'pan' ? (sign * 3) / burst : 0
        const y = sentKind === 'zoom' ? (sign * 1.2) / burst : 0
        const dispatchStarted = performance.now()
        for (let index = 0; index < burst; index += 1) {
          pane.dispatchEvent(
            new WheelEvent('wheel', {
              view: window,
              bubbles: true,
              cancelable: true,
              deltaX: x,
              deltaY: y,
              ctrlKey: sentKind === 'zoom',
              clientX: center.x + center.width / 2,
              clientY: center.y + center.height / 2,
            }),
          )
          deltaX += x
          deltaY += y
        }
        dispatchMs = performance.now() - dispatchStarted
        eventCount = burst
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })
    const durationMs = performance.now() - started
    const intervals = frames.map((frame) => frame.intervalMs).sort((a, b) => a - b)
    const percentile = (ratio: number) => intervals[Math.floor((intervals.length - 1) * ratio)] ?? 0
    const phases = [...new Set(frames.map((frame) => frame.phase))].map((phase) => {
      const samples = frames.filter((frame) => frame.phase === phase)
      return {
        phase,
        kind: samples[0]?.kind,
        frames: samples.length,
        events: samples.reduce((sum, frame) => sum + frame.events, 0),
        nodeUpdates: samples.filter((frame) => frame.nodeChanged).length,
        viewportUpdates: samples.filter((frame) => frame.viewportChanged).length,
        projectionUpdates: samples.filter((frame) => frame.projectionChanged).length,
        semanticUpdates: samples.filter((frame) =>
          frame.kind === 'pan' ? frame.panChanged : frame.zoomChanged,
        ).length,
      }
    })
    return {
      measurement: 'synthetic WebView render throughput; not physical GPU FPS',
      observedNodeId: node.dataset.id,
      eventsPerFrame: burst,
      durationMs,
      eventCount: frames.reduce((sum, frame) => sum + frame.events, 0),
      eventRate: (frames.reduce((sum, frame) => sum + frame.events, 0) * 1000) / durationMs,
      rafFps: (frames.length * 1000) / durationMs,
      nodeUpdatesFps: (frames.filter((frame) => frame.nodeChanged).length * 1000) / durationMs,
      viewportUpdatesFps:
        (frames.filter((frame) => frame.viewportChanged).length * 1000) / durationMs,
      projectionUpdatesFps:
        (frames.filter((frame) => frame.projectionChanged).length * 1000) / durationMs,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      longFrames: intervals.filter((interval) => interval > 50).length,
      maxGapMs: intervals.at(-1) ?? 0,
      dispatchMs: frames.reduce((sum, frame) => sum + frame.dispatchMs, 0),
      maxDispatchMs: Math.max(0, ...frames.map((frame) => frame.dispatchMs)),
      deltaX,
      deltaY,
      initial,
      final: geometry(),
      phases,
      frames,
    }
  }, eventsPerFrame)
