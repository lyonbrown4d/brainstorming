import { expect, test, type Locator, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const bounds = async (element: Locator) => {
  const box = await element.boundingBox()
  if (!box) throw new Error('Missing canvas geometry')
  return box
}
const open = async (page: Page, story = 'standard') => {
  await page.goto(`/iframe.html?id=brainstorming-交互调整--${story}&viewMode=story`)
  await expect(node(page, 'detail')).toBeVisible()
}
const drag = async (page: Page, grip: Locator, dx: number, dy: number, cancel = false) => {
  const box = await bounds(grip)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 })
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up()
}

test('topic width uses a real grip, commits once, cancels, and resets to Fit', async ({ page }) => {
  await open(page)
  await node(page, 'a').click()
  const before = await bounds(node(page, 'a'))
  const zoom = await node(page, 'a').evaluate(
    (element) =>
      element.getBoundingClientRect().width / Number.parseFloat(getComputedStyle(element).width),
  )
  const grip = node(page, 'a').locator('.react-flow__resize-control.right')
  await drag(page, grip, 120, 0)
  await expect
    .poll(async () => (await bounds(node(page, 'a'))).width)
    .toBeCloseTo(before.width + 120, 0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(node(page, 'a'))).width).toBeCloseTo(before.width, 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  const resized = await bounds(node(page, 'a'))
  await drag(page, grip, 80, 0, true)
  await expect.poll(async () => (await bounds(node(page, 'a'))).width).toBeCloseTo(resized.width, 0)
  await page.getByRole('button', { name: '属性面板', exact: true }).click()
  const width = page.getByRole('spinbutton', { name: '主题宽度', exact: true })
  await expect
    .poll(async () => Number(await width.inputValue()))
    .toBeCloseTo(resized.width / zoom, 0)
  await width.fill('240')
  await width.press('Enter')
  await expect(width).toHaveValue('240')
  await page.getByRole('button', { name: '适应内容', exact: true }).click()
  await expect.poll(async () => (await bounds(node(page, 'a'))).width).toBeCloseTo(before.width, 0)
})

test('left topic-width grip keeps the opposite edge in place', async ({ page }) => {
  await open(page)
  await node(page, 'a').click()
  const before = await bounds(node(page, 'a'))
  const grip = node(page, 'a').locator('.react-flow__resize-control.left')
  await drag(page, grip, -60, 0)
  const after = await bounds(node(page, 'a'))
  expect(after.width).toBeGreaterThan(before.width + 40)
  expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(node(page, 'a'))).width).toBeCloseTo(before.width, 0)
  await expect
    .poll(async () => {
      const restored = await bounds(node(page, 'a'))
      return restored.x + restored.width
    })
    .toBeCloseTo(before.x + before.width, 0)
})

for (const story of ['standard', 'horizontal-siblings'])
  test(`${story}: summary scope drag changes sibling range once and supports editable children`, async ({
    page,
  }) => {
    await open(page, story)
    const summary = page.locator('[data-summary-id="summary"]')
    const b = await bounds(node(page, 'b'))
    const c = await bounds(node(page, 'c'))
    const end = page.getByRole('button', { name: '拖动调整概要终点', exact: true })
    await drag(page, end, c.x - b.x, c.y - b.y)
    await expect(summary).toHaveAttribute('data-summary-members', 'a,b,c')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(summary).toHaveAttribute('data-summary-members', 'a,b')
    await drag(page, end, c.x - b.x, c.y - b.y, true)
    await expect(summary).toHaveAttribute('data-summary-members', 'a,b')
    await node(page, 'summary-topic').click()
    await page.keyboard.press('Tab')
    const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
    await expect(editor).toBeFocused()
    await page.keyboard.insertText('概要的新子主题')
    await page.locator('.react-flow__pane').click({ position: { x: 25, y: 160 } })
    const child = page.locator('.react-flow__node-topic').filter({ hasText: '概要的新子主题' })
    const id = await child.getAttribute('data-id')
    await expect(page.locator(`.react-flow__edge[data-id="edge-${id ?? ''}"]`)).toHaveAttribute(
      'aria-label',
      `Edge from summary-topic to ${id ?? ''}`,
    )
  })

test('shortcut recording rejects conflicts, persists after reload and changes the actual action', async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press('Meta+,')
  const settings = page.getByRole('dialog', { name: '应用设置', exact: true })
  await settings.getByRole('tab', { name: '快捷键', exact: true }).click()
  await settings.getByRole('textbox', { name: '搜索快捷键' }).fill('前往中心主题')
  const record = settings.getByRole('button', { name: '录制快捷键: 前往中心主题', exact: true })
  await record.click()
  await page.keyboard.press('Meta+s')
  await expect(settings.getByRole('alert')).toContainText('此组合键已分配给其他操作')
  await page.keyboard.press('Meta+Shift+g')
  await expect(record).toContainText('G')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(node(page, 'detail')).toBeVisible()
  await node(page, 'a').click()
  await page.keyboard.press('Meta+Shift+g')
  await expect(node(page, 'root')).toHaveClass(/selected/)
  await node(page, 'a').click()
  await page.keyboard.press('Meta+r')
  await expect(node(page, 'a')).toHaveClass(/selected/)
  await page.keyboard.press('Meta+,')
  await settings.getByRole('tab', { name: '快捷键', exact: true }).click()
  await settings.getByRole('button', { name: '全部恢复默认', exact: true }).click()
  await page.keyboard.press('Escape')
  await node(page, 'a').click()
  await page.keyboard.press('Meta+r')
  await expect(node(page, 'root')).toHaveClass(/selected/)
})
