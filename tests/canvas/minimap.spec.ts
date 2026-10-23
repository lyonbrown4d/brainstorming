import { expect, test } from '@playwright/test'

for (const story of ['navigation', 'dense-navigation', 'image-navigation', 'compact-navigation'])
  test(`${story}: the delayed official minimap accumulates every pan and wheel step`, async ({
    page,
  }) => {
    await page.goto(`/iframe.html?id=brainstorming-canvas-minimap--${story}&viewMode=story`)
    const minimap = page.locator('.react-flow__minimap-svg')
    const viewport = page.locator('.react-flow__viewport')
    const readTransform = () =>
      viewport.evaluate((element) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform)
        return { x: matrix.e, y: matrix.f, zoom: matrix.a }
      })
    if (story === 'image-navigation')
      await expect(page.locator('.react-flow__minimap-image')).toHaveAttribute(
        'data-minimap-node-count',
        '1000',
      )
    else
      await expect(page.locator('.react-flow__minimap-node')).toHaveCount(
        ['navigation', 'compact-navigation'].includes(story) ? 2 : 4,
      )
    await expect(minimap).toBeVisible()
    if (story === 'compact-navigation') {
      const size = await minimap.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        panelWidth: element.parentElement?.clientWidth,
        panelHeight: element.parentElement?.clientHeight,
      }))
      expect(size.width).toBe(size.panelWidth)
      expect(size.height).toBe(size.panelHeight)
      expect(size.width).toBeLessThan(120)
    }
    const box = await minimap.boundingBox()
    if (!box) throw new Error('Missing minimap geometry')
    const initial = await readTransform()
    const scale = await minimap.evaluate((element) => {
      const svg = element as SVGSVGElement
      return svg.viewBox.baseVal.width / (svg.width.baseVal.value + 10)
    })
    // Stay within the existing graph bounds so the official view scale stays constant.
    const dx = Math.round(box.width * 0.04)
    const dy = Math.round(box.height * 0.04)
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5 + dx, box.y + box.height * 0.5 + dy, {
      steps: 12,
    })
    await page.mouse.up()
    const panned = await readTransform()
    expect(panned.x - initial.x).toBeCloseTo(-dx * scale * initial.zoom, 0)
    expect(panned.y - initial.y).toBeCloseTo(-dy * scale * initial.zoom, 0)
    expect(panned.zoom).toBe(initial.zoom)
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    // Multiple wheel steps before the audit interval must accumulate rather than restart
    // from the overview's stale zoom. D3's official wheel factor is 2 ** (-deltaY * .002).
    for (let index = 0; index < 3; index++) await page.mouse.wheel(0, -30)
    await expect
      .poll(async () => (await readTransform()).zoom)
      .toBeCloseTo(initial.zoom * 2 ** (30 * 0.002 * 3), 2)
  })
