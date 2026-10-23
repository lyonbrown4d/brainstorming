import { browser, expect } from '@wdio/globals'
import { startNativePointer } from '@tests/native/native-pointer'
import { named, readDocument } from '@tests/native/driver'
import {
  openIndependentFixture,
  quietIndependentSpatial,
  readIndependentSpatial,
  waitIndependentSpatial,
} from '@tests/native/independent-spatial'

const showMinimap = async () => {
  const show = named('显示缩略图')
  if (await show.isDisplayed()) await show.click()
}
const dragOverview = async (selector: string, held: () => Promise<void>) => {
  const bounds = await browser.execute((selector) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error('Missing visible minimap')
    const box = element.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }, selector)
  const start = { x: bounds.x + bounds.width * 0.4, y: bounds.y + bounds.height * 0.5 }
  const pointer = await startNativePointer({
    id: 'minimap',
    start,
    end: { x: start.x + 12, y: start.y + 8 },
  })
  try {
    await pointer.held()
    await held()
  } finally {
    await pointer.release()
  }
}
const planarTransform = async () =>
  browser.execute(() => {
    const element = document.querySelector('.react-flow__viewport')
    if (!element) throw new Error('Missing planar viewport')
    const matrix = new DOMMatrix(getComputedStyle(element).transform)
    return { x: matrix.e, y: matrix.f, scale: matrix.a }
  })

it('drags native 2D/3D minimaps, keeps the 3D bitmap frozen, and reopens without changing topics', async () => {
  const fixture = await openIndependentFixture(1000)
  const topics = (await readDocument(fixture.name)).sheets[0]?.document.topics
  await showMinimap()
  const map = () => browser.$('canvas[data-spatial-minimap]')
  const mask = () => browser.$('[data-spatial-minimap-mask]')
  await expect(map()).toBeDisplayed()
  await browser.waitUntil(async () => Boolean(await mask().getAttribute('d')))
  const before = await readIndependentSpatial()
  const bitmap = await map().execute((element) => (element as HTMLCanvasElement).toDataURL())
  const maskBefore = await mask().getAttribute('d')
  await dragOverview('canvas[data-spatial-minimap]', async () => {
    expect(await mask().getAttribute('d')).not.toBe(maskBefore)
    expect(await map().execute((element) => (element as HTMLCanvasElement).toDataURL())).toBe(
      bitmap,
    )
    expect((await readIndependentSpatial()).camera?.matrix).not.toEqual(before.camera?.matrix)
  })
  await quietIndependentSpatial()
  await named('关闭缩略图').click()
  await expect(map()).not.toExist()
  await named('显示缩略图').click()
  await expect(map()).toBeDisplayed()
  await expect(mask()).toHaveAttribute('d', /M0,0/)
  await named('二维视图').click()
  await expect(browser.$('[data-canvas-loading]')).not.toExist()
  await showMinimap()
  await expect(browser.$('.react-flow__minimap-svg')).toBeDisplayed()
  const sizes = await browser.execute(() => {
    const element = document.querySelector('.react-flow__minimap-svg')
    if (!element) throw new Error('Missing native planar minimap')
    return {
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      parentWidth: element.parentElement?.clientWidth,
      parentHeight: element.parentElement?.clientHeight,
    }
  })
  expect(sizes.width).toBe(sizes.parentWidth)
  expect(sizes.height).toBe(sizes.parentHeight)
  const initial = await planarTransform()
  await dragOverview('.react-flow__minimap-svg', async () => {
    const current = await planarTransform()
    expect(Math.hypot(current.x - initial.x, current.y - initial.y)).toBeGreaterThan(1)
    expect(current.scale).toBe(initial.scale)
  })
  await named('关闭缩略图').click()
  await expect(browser.$('.react-flow__minimap-svg')).not.toExist()
  await named('显示缩略图').click()
  await expect(browser.$('.react-flow__minimap-svg')).toBeDisplayed()
  await named('三维视图').click()
  await waitIndependentSpatial()
  await expect(map()).toBeDisplayed()
  expect((await readDocument(fixture.name)).sheets[0]?.document.topics).toEqual(topics)
})
