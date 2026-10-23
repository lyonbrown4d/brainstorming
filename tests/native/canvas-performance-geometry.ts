import { browser } from '@wdio/globals'

/** Require a quiet interval across rendered frames, rather than two coincident polls. */
export const waitNativeCanvasQuiet = async () =>
  browser.execute(async () => {
    await new Promise<void>((resolve, reject) => {
      const bounds = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return [rect.x, rect.y, rect.width, rect.height]
      }
      let previous = ''
      let quietSince = performance.now()
      let frame = 0
      const timeout = window.setTimeout(() => {
        cancelAnimationFrame(frame)
        reject(new Error('Native canvas geometry did not settle while visible and focused'))
      }, 8000)
      const sample = (now: number) => {
        const canvas = document.querySelector('.canvas')
        const viewport = document.querySelector('.react-flow__viewport')
        const root = document.querySelector('[data-testid="topic-root"]')
        const ready =
          document.visibilityState === 'visible' &&
          document.hasFocus() &&
          !document.querySelector('[data-canvas-loading]') &&
          canvas &&
          viewport &&
          root
        const geometry = ready
          ? JSON.stringify({
              viewport: getComputedStyle(viewport).transform,
              root: bounds(root),
              canvas: bounds(canvas),
              window: [innerWidth, innerHeight, devicePixelRatio],
            })
          : ''
        if (!geometry || geometry !== previous) quietSince = now
        previous = geometry
        if (geometry && now - quietSince >= 350) {
          clearTimeout(timeout)
          resolve()
        } else frame = requestAnimationFrame(sample)
      }
      frame = requestAnimationFrame(sample)
    })
  })

/** Resolve the current visible topic body after focusing and settling the native window. */
export const nativePerformanceGesture = async (kind: 'root' | 'leaf') =>
  browser.execute((mode) => {
    if (document.visibilityState !== 'visible' || !document.hasFocus())
      throw new Error('Native drag geometry requires a visible and focused window')
    const nodes = [...document.querySelectorAll<HTMLElement>('.react-flow__node-topic')].map(
      (node) => ({ node, rect: node.getBoundingClientRect() }),
    )
    for (const { node, rect } of nodes) {
      const id = node.dataset.id
      if (
        mode === 'root'
          ? id !== 'root'
          : !id?.startsWith('topic-') || Number(id.split('-')[1]) < 250
      )
        continue
      if (!id || rect.width <= 0 || rect.height <= 0) continue
      const body = (node.querySelector('.topic') ?? node).getBoundingClientRect()
      for (const [rx, ry] of [
        [0.5, 0.5],
        [0.3, 0.5],
        [0.7, 0.5],
        [0.5, 0.3],
        [0.5, 0.7],
      ] as const) {
        const start = { x: body.x + body.width * rx, y: body.y + body.height * ry }
        if (
          start.x < 120 ||
          start.x > innerWidth - 120 ||
          start.y < 140 ||
          start.y > innerHeight - 200
        )
          continue
        const hit = document.elementFromPoint(start.x, start.y)
        if (hit?.closest('.react-flow__node') !== node || hit.closest('.nodrag')) continue
        if (mode === 'root')
          return {
            id,
            start,
            end: { x: start.x + 120, y: start.y + 70 },
            rect: { x: body.x, y: body.y },
          }
        for (let y = 180; y < innerHeight - 200; y += 80) {
          for (let x = 160; x < innerWidth - 120; x += 80) {
            if (Math.hypot(x - start.x, y - start.y) < 100) continue
            if (!document.elementFromPoint(x, y)?.matches('.react-flow__pane')) continue
            const left = rect.left + x - start.x,
              top = rect.top + y - start.y
            if (
              left < 60 ||
              top < 60 ||
              left + rect.width > innerWidth - 60 ||
              top + rect.height > innerHeight - 60
            )
              continue
            // Prediction uses the moving rectangle, with a 48 px reach and a 1.25 exit band.
            const blank = nodes.every(
              (other) =>
                other.node === node ||
                Math.hypot(
                  Math.max(other.rect.left - left - rect.width, left - other.rect.right, 0),
                  Math.max(other.rect.top - top - rect.height, top - other.rect.bottom, 0),
                ) > 60,
            )
            if (blank) return { id, start, end: { x, y }, rect: { x: rect.x, y: rect.y } }
          }
        }
      }
    }
    throw new Error(`No visible ${mode} topic body with a safe drag destination`)
  }, kind)

/** Large-map measurements must exercise the warmed GPU path rather than its DOM fallback. */
export const waitNativeSpatialSprites = async () => {
  await browser.waitUntil(
    () =>
      browser.execute(() => {
        const layer = document.querySelector<HTMLElement>('[data-spatial-sprite-ready]')
        if (layer?.dataset.spatialSpriteError) throw new Error(layer.dataset.spatialSpriteError)
        return (
          layer?.dataset.spatialSpriteReady === 'true' &&
          Number(layer.dataset.spatialSpriteCount) > 800
        )
      }),
    { timeout: 15000, timeoutMsg: 'Far-topic GPU renderer did not become ready' },
  )
}
