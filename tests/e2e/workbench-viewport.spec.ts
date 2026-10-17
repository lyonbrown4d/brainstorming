import { prepareNativeSave } from '@tests/electron/native-files'
import { expect, test, type Locator, type Page } from '@tests/electron/fixture'
import { readFile } from 'node:fs/promises'
import { decodeBrainstorming } from '@formats/brainstorming'
import { openExample } from '@tests/e2e/workspace'

test.use({ reducedMotion: 'no-preference' })

const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('主题不可见')
  return box
}

const settled = async (locator: Locator) => {
  let previous = await bounds(locator)
  let stable = 0
  await expect
    .poll(async () => {
      const current = await bounds(locator)
      stable = Math.hypot(current.x - previous.x, current.y - previous.y) < 0.1 ? stable + 1 : 0
      previous = current
      return stable
    })
    .toBeGreaterThanOrEqual(3)
}

const expectPanelAnchor = async (topic: Locator, action: () => Promise<void>) => {
  const before = await bounds(topic)
  // Sample the public card rectangle through the panel's width animation, including its exit.
  const sampling = topic.evaluate(async (element) => {
    const samples: { x: number; y: number; width: number }[] = []
    const until = performance.now() + 550
    while (performance.now() < until) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          resolve()
        }),
      )
      const rect = element.getBoundingClientRect()
      samples.push({ x: rect.x, y: rect.y, width: rect.width })
    }
    return samples
  })
  await action()
  const samples = await sampling
  expect(samples.length).toBeGreaterThan(2)
  for (const sample of samples) {
    expect(Math.abs(sample.x - before.x)).toBeLessThan(8)
    expect(Math.abs(sample.y - before.y)).toBeLessThan(8)
    expect(Math.abs(sample.width - before.width)).toBeLessThan(3)
  }
}

const savedSheets = async (page: Page) => {
  const pending = await prepareNativeSave(page)
  await page.keyboard.press('ControlOrMeta+s')
  const path = await pending.path()
  if (!path) throw new Error('没有生成保存文件')
  return decodeBrainstorming(await readFile(path)).sheets
}

for (const mode of ['2d', '3d'] as const) {
  test(`${mode} 面板开合期间选中主题位置和缩放稳定，文件内容不变`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openExample(page)
    if (mode === '3d') await page.getByRole('button', { name: '三维视图', exact: true }).click()
    const topic =
      mode === '2d' ? page.getByTestId('topic-root') : page.locator('[data-spatial-card-id="root"]')
    await expect(topic).toBeVisible()
    const outline = page.getByRole('button', { name: '文档大纲', exact: true })
    const inspector = page.getByRole('button', {
      name: '属性面板',
      exact: true,
    })
    for (const toggle of [outline, inspector])
      if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click()
    await settled(topic)
    await topic.click()
    const baseline = await savedSheets(page)
    const zoom =
      mode === '2d'
        ? page.locator('.zoom-value')
        : page.getByRole('status', { name: '3D 缩放比例' })
    const initial = await zoom.textContent()
    await page
      .getByRole('button', {
        name: mode === '2d' ? '放大' : '放大 3D 画布',
        exact: true,
      })
      .click()
    await expect(zoom).not.toHaveText(initial ?? '')
    await settled(topic)
    const zoomed = await zoom.textContent()
    for (const toggle of [outline, inspector, outline, inspector]) {
      await expectPanelAnchor(topic, async () => {
        await toggle.click()
      })
      await expect(zoom).toHaveText(zoomed ?? '')
    }
    expect(await savedSheets(page)).toEqual(baseline)
    expect(errors).toEqual([])
  })
}

test('三维新增主题保留缩放并显示新主题，显式适应全图仍恢复缩放', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openExample(page)
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  const root = page.locator('[data-spatial-card-id="root"]')
  await expect(root).toBeVisible()
  await root.click()
  const zoom = page.getByRole('status', { name: '3D 缩放比例' })
  await page.getByRole('button', { name: '放大 3D 画布', exact: true }).click()
  await expect(zoom).not.toHaveText('100%')
  await settled(root)
  const zoomed = await zoom.textContent()
  const before = await bounds(root)
  await root.click()
  await page.keyboard.press('Tab')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await editor.fill('新分支保持当前视角')
  await page.keyboard.press('Enter')
  await expect(zoom).toHaveText(zoomed ?? '')
  await settled(root)
  const after = await bounds(root)
  // Revealing an offscreen new selection may pan; it must retain the user's scale.
  expect(after.width).toBeCloseTo(before.width, 0)
  await expect(
    page.getByRole('button', { name: '选择主题 新分支保持当前视角', exact: true }),
  ).toBeInViewport()
  await page.getByRole('button', { name: '适应全图', exact: true }).click()
  await expect(zoom).toHaveText('100%')
  expect(errors).toEqual([])
})

for (const mode of ['2d', '3d'] as const) {
  test(`${mode} 适应全图尊重侧栏可见区域，底部工具不盖住侧栏`, async ({ page }) => {
    await openExample(page)
    await page.getByRole('button', { name: '文档大纲', exact: true }).click()
    await page.getByRole('button', { name: '属性面板', exact: true }).click()
    if (mode === '3d') await page.getByRole('button', { name: '三维视图', exact: true }).click()
    const root =
      mode === '2d' ? page.getByTestId('topic-root') : page.locator('[data-spatial-card-id="root"]')
    await expect(root).toBeVisible()
    await page
      .getByRole('button', { name: mode === '2d' ? '适应画布' : '适应全图', exact: true })
      .click()
    await settled(root)
    const outline = await bounds(page.getByRole('complementary', { name: '文档大纲', exact: true }))
    const inspector = await bounds(
      page.getByRole('complementary', { name: '属性面板', exact: true }),
    )
    const cards = page.locator(mode === '2d' ? '[data-testid^="topic-"]' : '[data-spatial-card-id]')
    for (const card of await cards.all()) {
      const rect = await bounds(card)
      expect(rect.x).toBeGreaterThan(outline.x + outline.width)
      expect(rect.x + rect.width).toBeLessThan(inspector.x)
    }
    const entry = page.getByRole('button', { name: '展开浮动工具栏', exact: true })
    await entry.click()
    const dock = await bounds(page.locator('#floating-map-actions'))
    expect(dock.x).toBeGreaterThan(outline.x + outline.width)
    expect(dock.x + dock.width).toBeLessThan(inspector.x)
  })
}
