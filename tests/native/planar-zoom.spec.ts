import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { nativeArtifact } from '@tests/native/artifacts'
import { fixture, focusNativeWindow } from '@tests/native/driver'
import { openPlanarZoomFixture } from '@tests/native/planar-zoom-fixture'

const linuxTest = process.platform === 'linux' ? it : it.skip

const view = () =>
  browser.execute(() => {
    const viewport = document.querySelector('.react-flow__viewport')
    const header = document.querySelector('header.toolbar')
    if (!viewport || !header) throw new Error('The ready planar workspace is missing')
    return {
      zoom: new DOMMatrix(getComputedStyle(viewport).transform).a,
      width: innerWidth,
      height: innerHeight,
      header: header.getBoundingClientRect().height,
      ratio: devicePixelRatio,
    }
  })

/** Check native pixels as well as DOM bounds, so a stale composited layer cannot pass. */
const paintedRootSamples = async (): Promise<number> => {
  const screenshot = await browser.takeScreenshot()
  return browser.execute(async (data) => {
    const shape = document.querySelector('[data-testid="topic-root"] > svg path')
    if (!shape) throw new Error('The actual root shape is missing')
    const fill = getComputedStyle(shape)
      .fill.match(/[\d.]+/g)
      ?.map(Number)
    if (!fill || fill.length < 3) throw new Error('The root fill cannot be sampled')
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const surface = document.createElement('canvas')
    surface.width = image.naturalWidth
    surface.height = image.naturalHeight
    const context = surface.getContext('2d')
    if (!context) throw new Error('The native screenshot cannot be decoded')
    context.drawImage(image, 0, 0)
    const bounds = shape.getBoundingClientRect()
    const texts = [...document.querySelectorAll<HTMLElement>('.topic span')].filter((element) => {
      const box = element.getBoundingClientRect()
      return (
        element.textContent &&
        !element.hasAttribute('aria-hidden') &&
        box.width > 8 &&
        box.left > 0 &&
        box.right < innerWidth &&
        box.top > 60 &&
        box.bottom < innerHeight - 60
      )
    })
    for (const text of texts) {
      const box = text.getBoundingClientRect()
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      if (hit?.closest('.topic') !== text.closest('.topic')) continue
      const color = getComputedStyle(text)
        .color.match(/[\d.]+/g)
        ?.map(Number)
      if (!color) throw new Error('Topic text color missing')
      const x = Math.floor((box.left * surface.width) / innerWidth)
      const y = Math.floor((box.top * surface.height) / innerHeight)
      const width = Math.max(1, Math.ceil((box.width * surface.width) / innerWidth))
      const height = Math.max(1, Math.ceil((box.height * surface.height) / innerHeight))
      const pixels = context.getImageData(x, y, width, height).data
      let ink = 0
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (
          [0, 1, 2].every(
            (index) => Math.abs((pixels[offset + index] ?? 0) - (color[index] ?? 0)) < 55,
          )
        )
          ink++
      }
      if (ink < 2)
        throw new Error(`Text pixels left DOM bounds: ${text.textContent}, ${JSON.stringify(box)}`)
    }
    for (const outline of document.querySelectorAll<HTMLImageElement>('.topic > img')) {
      const box = outline.getBoundingClientRect()
      const topic = outline.closest('.topic')
      const scale = box.width / outline.naturalWidth
      if (
        !topic ||
        scale < 0.6 ||
        box.left < 0 ||
        box.right > innerWidth ||
        box.top < 60 ||
        box.bottom > innerHeight - 60
      )
        continue
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      if (hit?.closest('.topic') !== topic) continue
      const hex = getComputedStyle(topic).getPropertyValue('--branch-color').trim()
      if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error('Cached outline stroke is missing')
      const stroke = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
      const x = Math.round(((box.x + box.width / 2) * surface.width) / innerWidth)
      const y = Math.round(((box.y + 3 * scale) * surface.height) / innerHeight)
      const pixels = context.getImageData(x - 2, y - 2, 5, 5).data
      const background = getComputedStyle(
        document.querySelector('[aria-label="当前画布"]') ?? document.body,
      )
        .backgroundColor.match(/[\d.]+/g)
        ?.map(Number)
      if (!background) throw new Error('Canvas background is missing')
      const direction = stroke.map((channel, index) => channel - (background[index] ?? 0))
      const magnitude = direction.reduce((sum, channel) => sum + channel * channel, 0)
      let painted = false
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const difference = direction.map(
          (_, index) => (pixels[offset + index] ?? 0) - (background[index] ?? 0),
        )
        const alpha =
          difference.reduce((sum, channel, index) => sum + channel * (direction[index] ?? 0), 0) /
          magnitude
        if (
          alpha > 0.15 &&
          alpha <= 1.2 &&
          [0, 1, 2].every(
            (index) => Math.abs((difference[index] ?? 0) - alpha * (direction[index] ?? 0)) < 30,
          )
        )
          painted = true
      }
      if (!painted)
        throw new Error(
          `Cached outline pixels left DOM bounds: ${topic.getAttribute('data-testid')}`,
        )
    }
    return [
      [0.2, 0.25],
      [0.8, 0.25],
      [0.2, 0.75],
      [0.8, 0.75],
    ].filter(([x = 0, y = 0]) => {
      const pixel = context.getImageData(
        Math.round(((bounds.x + bounds.width * x) * surface.width) / innerWidth),
        Math.round(((bounds.y + bounds.height * y) * surface.height) / innerHeight),
        1,
        1,
      ).data
      return [0, 1, 2].every((index) => Math.abs((pixel[index] ?? 0) - (fill[index] ?? 0)) < 20)
    }).length
  }, screenshot)
}

linuxTest(
  'Ctrl-wheel keeps planar native pixels aligned with DOM geometry and preserves UI scale',
  async () => {
    await openPlanarZoomFixture()
    await focusNativeWindow()
    console.log('Planar fixture ready')
    const initial = await view()
    await browser.waitUntil(async () => (await paintedRootSamples()) >= 2, {
      timeoutMsg: 'Native root pixels must match the current DOM geometry',
    })
    await browser.saveScreenshot(await nativeArtifact('linux-planar-zoom-before.png'))
    await browser.performActions([
      { type: 'key', id: 'zoom-control', actions: [{ type: 'keyDown', value: Key.Control }] },
    ])
    try {
      let previous = initial.zoom
      for (const discrete of [false, true]) {
        for (const deltaY of [-2, -2, -2, -2, 2, 2, 2, 2, 2, 2, -2, -2]) {
          await focusNativeWindow()
          const request = await browser.execute((deltaY) => {
            const root = document.querySelector('[data-testid="topic-root"]')
            if (!root) throw new Error('The root is missing before native Ctrl-wheel')
            const bounds = root.getBoundingClientRect()
            return {
              viewport: { width: innerWidth, height: innerHeight },
              point: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
              deltaX: 0,
              deltaY,
              control: true,
            }
          }, deltaY)
          const native = await fixture<{ webviewZoom: number }>('nativeWheel', {
            ...request,
            discrete,
          })
          await browser.waitUntil(async () => (await view()).zoom !== previous)
          const current = await view()
          expect(current.width).toBe(initial.width)
          expect(current.height).toBe(initial.height)
          expect(current.header).toBe(initial.header)
          expect(current.ratio).toBe(initial.ratio)
          await browser.waitUntil(async () => (await paintedRootSamples()) >= 2, {
            timeoutMsg: 'Native root pixels must match the current DOM geometry',
          })
          console.log('Linux Ctrl-wheel native geometry:', { deltaY, discrete, native, current })
          previous = current.zoom
        }
      }
      await browser.saveScreenshot(await nativeArtifact('linux-planar-zoom-after.png'))
    } finally {
      await browser.releaseActions()
    }
  },
)
