import { browser } from '@wdio/globals'

/** Exercise normal node click handlers and observe committed selection on subsequent frames. */
export const sampleHighFrequencySelection = async () =>
  browser.execute(async () => {
    const candidates = [...document.querySelectorAll<HTMLElement>('.react-flow__node-topic')]
      .flatMap((node) => {
        const body = (node.querySelector('.topic') ?? node).getBoundingClientRect()
        const id = node.dataset.id
        if (!id) return []
        const x = body.x + body.width / 2
        const y = body.y + body.height / 2
        const target = document.elementFromPoint(x, y)
        if (target?.closest('.react-flow__node') !== node || target.closest('.nodrag')) return []
        return [{ id, x, y }]
      })
      .slice(0, 2)
    if (candidates.length !== 2)
      throw new Error('Selection sampling requires two visible topic bodies')
    const samples: {
      intervalMs: number
      selected: string
      requested: string
      dispatchMs: number
    }[] = []
    const initialSelection = [
      ...document.querySelectorAll<HTMLElement>('.react-flow__node-topic.selected'),
    ]
      .map((node) => node.dataset.id ?? '')
      .sort()
      .join(',')
    let previous = performance.now()
    const started = previous
    let requested = ''
    let dispatchMs = 0
    await new Promise<void>((resolve, reject) => {
      let frame = 0
      const timeout = window.setTimeout(() => {
        cancelAnimationFrame(frame)
        reject(new Error('Selection sampling stopped producing frames'))
      }, 6000)
      const tick = (now: number) => {
        if (
          document.visibilityState !== 'visible' ||
          !document.hasFocus() ||
          document.querySelector('[data-canvas-loading]')
        ) {
          clearTimeout(timeout)
          reject(new Error('Selection sampling requires a ready, visible and focused window'))
          return
        }
        const selected = [
          ...document.querySelectorAll<HTMLElement>('.react-flow__node-topic.selected'),
        ]
          .map((node) => node.dataset.id ?? '')
          .sort()
          .join(',')
        if (requested) samples.push({ intervalMs: now - previous, selected, requested, dispatchMs })
        previous = now
        if (samples.length === 30) {
          clearTimeout(timeout)
          resolve()
          return
        }
        const candidate = candidates[samples.length % candidates.length]
        if (!candidate) throw new Error('Missing selection candidate')
        const target = document.elementFromPoint(candidate.x, candidate.y)
        if (
          target?.closest('.react-flow__node')?.getAttribute('data-id') !== candidate.id ||
          target.closest('.nodrag')
        ) {
          clearTimeout(timeout)
          reject(new Error('Selection must hit the expected topic body'))
          return
        }
        requested = candidate.id
        const dispatchStarted = performance.now()
        target.dispatchEvent(
          new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            detail: 1,
            clientX: candidate.x,
            clientY: candidate.y,
          }),
        )
        dispatchMs = performance.now() - dispatchStarted
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })
    const durationMs = performance.now() - started
    const intervals = samples.map((sample) => sample.intervalMs).sort((a, b) => a - b)
    const percentile = (ratio: number) => intervals[Math.floor((intervals.length - 1) * ratio)] ?? 0
    return {
      measurement: 'synthetic WebView selection render throughput; not physical GPU FPS',
      durationMs,
      events: samples.length,
      eventRate: (samples.length * 1000) / durationMs,
      actualChanges: samples.filter(
        (sample, index) => sample.selected !== (samples[index - 1]?.selected ?? initialSelection),
      ).length,
      matched: samples.filter((sample) => sample.selected === sample.requested).length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      longFrames: intervals.filter((interval) => interval > 50).length,
      maxGapMs: intervals.at(-1) ?? 0,
      dispatchMs: samples.reduce((sum, sample) => sum + sample.dispatchMs, 0),
      samples,
    }
  })
