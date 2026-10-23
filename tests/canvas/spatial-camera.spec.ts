import { expect, test } from '@playwright/test'
import {
  clickSpatial,
  dragSpatialPoint,
  locatorBounds,
  openSpatial,
  openSpatialCamera,
  settledSpatialRect,
  spatialCanvas,
  spatialEvidence,
  spatialPoint,
  spatialRect,
} from '@tests/canvas/spatial-test-geometry'

const story = '/iframe.html?id=brainstorming-空间视图--interactive&viewMode=story'

test('camera preset and angle slider each save one undoable view change', async ({ page }) => {
  await openSpatial(page)
  const original = await spatialEvidence(page)
  await openSpatialCamera(page)
  const yaw = page.getByRole('slider', { name: '水平角度', exact: true }),
    pitch = page.getByRole('slider', { name: '垂直角度', exact: true })
  await expect(yaw).toHaveAttribute('aria-valuenow', '40')
  await expect(pitch).toHaveAttribute('aria-valuenow', '29')
  await page.getByRole('button', { name: '右侧', exact: true }).click()
  await expect(yaw).toHaveAttribute('aria-valuenow', '90')
  await expect(pitch).toHaveAttribute('aria-valuenow', '0')
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await openSpatialCamera(page)
  await expect(yaw).toHaveAttribute('aria-valuenow', '40')
  await expect(pitch).toHaveAttribute('aria-valuenow', '29')
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await openSpatialCamera(page)
  await expect(yaw).toHaveAttribute('aria-valuenow', '90')
  const thumb = await locatorBounds(yaw),
    rail = await locatorBounds(
      page.locator('[data-slot="popover-content"] [data-slot="slider"]').first(),
    )
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)
  await page.mouse.down()
  await page.mouse.move(rail.x + rail.width * 0.55, thumb.y + thumb.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(yaw).not.toHaveAttribute('aria-valuenow', '90')
  await expect
    .poll(async () => (await spatialEvidence(page)).history.past)
    .toBe(original.history.past + 2)
  await page.locator('#sheet-panel').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await openSpatialCamera(page)
  await expect(yaw).toHaveAttribute('aria-valuenow', '90')
})

test('side view preserves mixed moves, Chinese title editing, resize and zoom', async ({
  page,
}) => {
  await openSpatial(page)
  await openSpatialCamera(page)
  await page.getByRole('button', { name: '右侧', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  await settledSpatialRect(page, 'branch-a')
  await clickSpatial(page, 'branch-a')
  await clickSpatial(page, 'ink-spatial-ink', true)
  const original = (await spatialEvidence(page)).document
  const branch = await spatialRect(page, 'branch-a'),
    stroke = await spatialRect(page, 'ink-spatial-ink')
  await dragSpatialPoint(page, await spatialPoint(page, 'branch-a'), 65, 35)
  await expect
    .poll(async () => (await spatialRect(page, 'branch-a')).x)
    .toBeGreaterThan(branch.x + 30)
  await expect
    .poll(async () => {
      const next = await spatialRect(page, 'ink-spatial-ink')
      return Math.hypot(next.x - stroke.x, next.y - stroke.y)
    })
    .toBeGreaterThan(20)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await spatialEvidence(page)).document).toEqual(original)
  await clickSpatial(page, 'branch-a')
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('侧视编辑')
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => (await spatialEvidence(page)).document.topics['branch-a']?.title)
    .toBe('侧视编辑')
  const grip = await locatorBounds(page.locator('[data-spatial-scale] button').nth(3)),
    width = (await spatialRect(page, 'branch-a')).width
  await dragSpatialPoint(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 55, 25)
  await expect
    .poll(async () => (await spatialRect(page, 'branch-a')).width)
    .toBeGreaterThan(width + 20)
  const zoom = page.locator('.zoom-value'),
    initial = await zoom.textContent()
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await expect(zoom).not.toHaveText(initial ?? '')
  expect(
    (await spatialEvidence(page)).rectangles.some((rect) => rect.id === 'ink-spatial-ink'),
  ).toBe(true)
})

test('first Three frame keeps a loading gate until the renderer chunk is available', async ({
  page,
}) => {
  let release: () => void = () => undefined,
    requested = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    /\/(?:IndependentSpatialCanvas-[^/]+\.js|src\/components\/spatial\/independent\/IndependentSpatialCanvas\.tsx)(?:\?.*)?$/,
    async (route) => {
      requested = true
      await gate
      await route.continue()
    },
  )
  try {
    await page.goto(story, { waitUntil: 'domcontentloaded' })
    await expect.poll(() => requested).toBe(true)
    const mask = page.locator('[data-canvas-loading]')
    await expect(mask).toBeVisible()
    await expect(mask).toHaveAttribute('aria-busy', 'true')
    const initial = (await spatialEvidence(page)).document
    await mask.click({ position: { x: 100, y: 120 } })
    await page.keyboard.press('F2')
    await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toHaveCount(0)
    expect((await spatialEvidence(page)).document).toEqual(initial)
  } finally {
    release()
  }
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0, { timeout: 20_000 })
  await expect(spatialCanvas(page)).toBeVisible()
  await clickSpatial(page, 'branch-a')
  await page.keyboard.press('F2')
  await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toBeFocused()
})

test('WebGL failure exposes retry and returning to 2D preserves document editing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: new Proxy(original, {
        apply: (target, canvas, args) => {
          const kind: unknown = args[0]
          if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null
          return Reflect.apply(target, canvas, args) as unknown
        },
      }),
    })
  })
  await page.goto(story)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新读取', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '二维视图', exact: true }).click()
  await expect(page.locator('#sheet-panel[data-view-mode="2d"]')).toBeVisible()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
  await page.locator('.react-flow__node[data-id="branch-a"] .topic-title').click()
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('恢复编辑')
  await page.keyboard.press('Enter')
  await expect(page.locator('.react-flow__node[data-id="branch-a"] .topic-title')).toHaveText(
    '恢复编辑',
  )
})

test('native composition keeps Tab and Enter inside the 3D editor until candidate commit', async ({
  page,
  context,
}) => {
  await openSpatial(page)
  await clickSpatial(page, 'branch-a')
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  const session = await context.newCDPSession(page)
  await session.send('Input.imeSetComposition', {
    text: '候选',
    selectionStart: 2,
    selectionEnd: 2,
  })
  // Native IMEs send Process/229 while choosing a candidate, rather than a navigation Tab.
  for (const code of ['Tab', 'Enter']) {
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Process',
      code,
      windowsVirtualKeyCode: 229,
      nativeVirtualKeyCode: 229,
    })
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Process',
      code,
      windowsVirtualKeyCode: 229,
      nativeVirtualKeyCode: 229,
    })
  }
  await expect(editor).toBeFocused()
  expect(Object.keys((await spatialEvidence(page)).document.topics)).toHaveLength(4)
  expect((await spatialEvidence(page)).document.topics['branch-a']?.title).toBe('产品方向')
  await session.send('Input.insertText', { text: '中文空间输入' })
  await session.detach()
  await page.keyboard.press('Enter')
  await expect(editor).toHaveCount(0)
  await expect
    .poll(async () => (await spatialEvidence(page)).document.topics['branch-a']?.title)
    .toBe('中文空间输入')
  await page.keyboard.press('Tab')
  await expect(editor).toBeFocused()
  await expect
    .poll(async () => Object.keys((await spatialEvidence(page)).document.topics).length)
    .toBe(5)
})
