import { browser } from '@wdio/globals'

interface Point {
  readonly x: number
  readonly y: number
}

/** tauri-plugin-wdio-webdriver 1.5.0 omits MouseEvent.view and held buttons on moves, which D3 drag requires.
 * Exercise that WebKit event contract here; tests/canvas retains real pointer hit-testing.
 * This helper never calls editor commands or bypasses a loading/selection guard.
 */
export const previewNativeCanvasDrag = async (start: Point, end: Point, id = 'root') =>
  browser.execute(
    async ({ start, end, id }) => {
      const target = document.elementFromPoint(start.x, start.y)
      if (target?.closest('.react-flow__node')?.getAttribute('data-id') !== id)
        throw new Error('Drag must hit the expected topic body')
      if (document.querySelector('[data-canvas-loading]')) throw new Error('Canvas is not ready')
      const node = target.closest('.react-flow__node')
      const initial = node?.getAttribute('style')
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
      const frames: number[] = []
      let previous = performance.now()
      for (let index = 1; index <= 30; index += 1) {
        const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
        frames.push(now - previous)
        previous = now
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            view: window,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: start.x + ((end.x - start.x) * index) / 30,
            clientY: start.y + ((end.y - start.y) * index) / 30,
          }),
        )
      }
      frames.sort((a, b) => a - b)
      return {
        changed: initial !== node?.getAttribute('style'),
        mounted: document.querySelectorAll('.react-flow__node-topic').length,
        fps: (frames.length * 1000) / frames.reduce((sum, value) => sum + value, 0),
        p95: frames[Math.floor(frames.length * 0.95)],
      }
    },
    { start, end, id },
  )

export const finishNativeCanvasDrag = async (point: Point) =>
  browser.execute(({ x, y }) => {
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
