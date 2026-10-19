import { expect, test, type Locator, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const edge = (page: Page, id: string) => page.locator(`.react-flow__edge[data-id="edge-${id}"]`)
const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Missing node geometry')
  return box
}
const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-画布自由绘图--mixed-selection&viewMode=story')
  await expect(node(page, 'branch')).toBeVisible()
  await expect(node(page, 'descendant')).toBeVisible()
}
const startDrag = async (page: Page, box: { x: number; y: number; width: number }) => {
  const point = { x: box.x + box.width / 2, y: box.y + 3 }
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 5, point.y)
  return point
}

test('Tab and Enter commit text and create the next level or a sibling without an extra Enter', async ({
  page,
}) => {
  await open(page)
  await node(page, 'branch').click()
  await page.keyboard.press('Tab')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('第一条想法')
  const first = await page
    .locator('.react-flow__node')
    .filter({ has: editor })
    .getAttribute('data-id')
  if (!first) throw new Error('Missing created topic')
  await page.keyboard.press('Enter')
  await expect(node(page, first)).toContainText('第一条想法')
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(5)
  await expect(editor).toBeFocused()
  const second = await page
    .locator('.react-flow__node')
    .filter({ has: editor })
    .getAttribute('data-id')
  if (!second) throw new Error('Missing sibling')
  await expect(edge(page, first)).toHaveAttribute('aria-label', `Edge from branch to ${first}`)
  await expect(edge(page, second)).toHaveAttribute('aria-label', `Edge from branch to ${second}`)
  await page.keyboard.insertText('第二条想法')
  await page.keyboard.press('Tab')
  await expect(node(page, second)).toContainText('第二条想法')
  const child = await page
    .locator('.react-flow__node')
    .filter({ has: editor })
    .getAttribute('data-id')
  if (!child) throw new Error('Missing nested topic')
  await expect(edge(page, child)).toHaveAttribute('aria-label', `Edge from ${second} to ${child}`)
  await page.keyboard.insertText('换行前')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.insertText('换行后')
  await expect(editor).toHaveText('换行前\n换行后', { useInnerText: true })
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(6)
  // IME-owned Enter must never create a map topic.
  await editor.evaluate((element) => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    )
  })
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(6)
  await page.keyboard.press('Escape')
  await expect(node(page, child)).toContainText('新主题')
  await node(page, child).dblclick()
  await expect(editor).toBeFocused()
  await page.keyboard.press('Control+Tab')
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(6)
})

test('freely moves an attached subtree, shows local reparent feedback, cancels and restores with undo', async ({
  page,
}) => {
  await open(page)
  const branch = await bounds(node(page, 'branch'))
  const child = await bounds(node(page, 'descendant'))
  const root = await bounds(node(page, 'root'))
  const from = await startDrag(page, branch)
  await page.mouse.move(from.x + 5 + 60, from.y + 140, { steps: 12 })
  await expect(page.getByTestId('drag-feedback')).toContainText('松开保留位置')
  await expect(page.getByTestId('drop-preview')).toHaveCount(0)
  await page.mouse.up()
  for (const [id, before] of [
    ['branch', branch],
    ['descendant', child],
  ] as const) {
    await expect.poll(async () => (await bounds(node(page, id))).x).toBeCloseTo(before.x + 60, 0)
    await expect.poll(async () => (await bounds(node(page, id))).y).toBeCloseTo(before.y + 140, 0)
  }
  await expect(edge(page, 'branch')).toHaveAttribute('aria-label', 'Edge from root to branch')
  await expect(edge(page, 'descendant')).toHaveAttribute(
    'aria-label',
    'Edge from branch to descendant',
  )
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(node(page, 'branch'))).x).toBeCloseTo(branch.x, 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect
    .poll(async () => (await bounds(node(page, 'branch'))).x)
    .toBeCloseTo(branch.x + 60, 0)
  const moved = await bounds(node(page, 'descendant'))
  const anchor = await startDrag(page, moved)
  await page.mouse.move(
    anchor.x + 5 + root.x + root.width / 2 - moved.x - moved.width / 2,
    anchor.y + root.y + root.height / 2 - moved.y - moved.height / 2,
    { steps: 12 },
  )
  await expect(page.getByTestId('drop-preview')).toHaveAttribute('data-parent-id', 'root')
  await expect(page.getByTestId('drop-preview')).toHaveAttribute('data-drop-mode', 'child')
  await expect(page.getByTestId('drag-feedback')).toContainText('成为「组合移动」的子主题')
  await page.screenshot({ path: 'test-results/canvas/topic-reparent-preview.png' })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(async () => (await bounds(node(page, 'descendant'))).x).toBeCloseTo(moved.x, 0)
  await expect(edge(page, 'descendant')).toHaveAttribute(
    'aria-label',
    'Edge from branch to descendant',
  )
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(node(page, 'branch'))).x).toBeCloseTo(branch.x, 0)
})

test('insertion feedback identifies the resulting parent and keeps the hierarchy undoable', async ({
  page,
}) => {
  await open(page)
  const child = await bounds(node(page, 'descendant'))
  const target = await bounds(node(page, 'branch'))
  const from = await startDrag(page, child)
  await page.mouse.move(
    from.x + 5 + target.x + target.width / 2 - child.x - child.width / 2,
    from.y + target.y - 4 - child.y - child.height / 2,
    { steps: 12 },
  )
  await expect(page.getByTestId('drop-preview')).toHaveAttribute('data-drop-mode', 'sibling')
  await expect(page.getByTestId('drop-preview')).toHaveAttribute('data-parent-id', 'root')
  await expect(page.getByTestId('drop-insertion')).toBeVisible()
  await expect(page.getByTestId('drag-feedback')).toContainText('「组合移动」下')
  await page.screenshot({ path: 'test-results/canvas/topic-sibling-preview.png' })
  await page.mouse.up()
  await expect(edge(page, 'descendant')).toHaveAttribute(
    'aria-label',
    'Edge from root to descendant',
  )
  await page.keyboard.press('ControlOrMeta+z')
  await expect(edge(page, 'descendant')).toHaveAttribute(
    'aria-label',
    'Edge from branch to descendant',
  )
})

test('link, note, palette and settings shortcuts reveal and focus their existing controls', async ({
  page,
}) => {
  await open(page)
  await node(page, 'branch').click()
  await page.keyboard.press('Meta+k')
  const link = page.getByRole('textbox', { name: '链接地址', exact: true })
  await expect(link).toBeVisible()
  await expect(link).toBeFocused()
  await link.fill('https://example.com')
  await page.getByRole('button', { name: '保存链接', exact: true }).click()
  await node(page, 'branch').click()
  await page.keyboard.press('Meta+Shift+n')
  const notes = page.getByRole('textbox', { name: '主题备注', exact: true })
  await expect(notes).toBeFocused()
  await page.keyboard.insertText('快捷键编辑备注')
  await page.keyboard.press('Meta+Shift+p')
  await expect(page.getByRole('dialog', { name: '命令面板', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Meta+,')
  const settings = page.getByRole('dialog', { name: '应用设置', exact: true })
  await expect(settings).toBeVisible()
  await settings.getByRole('tab', { name: '快捷键', exact: true }).click()
  await settings.getByRole('textbox', { name: '搜索快捷键' }).fill('链接')
  await expect(settings).toContainText('⌘ + K')
  await expect(settings).not.toContainText('Ctrl + Delete')
  await page.keyboard.press('Escape')
  await expect(notes).toContainText('快捷键编辑备注')
})
