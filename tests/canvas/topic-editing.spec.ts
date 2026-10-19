import { expect, test, type Locator, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Missing topic geometry')
  return box
}
const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-画布自由绘图--mixed-selection&viewMode=story')
  await expect(node(page, 'descendant')).toBeVisible()
  await node(page, 'branch').click()
  await expect(node(page, 'branch').locator('.topic-input')).toBeFocused()
}
const editingTitle = (page: Page) =>
  page.getByRole('textbox', { name: '编辑主题标题', exact: true })

test('the selected inactive title drags its subtree from the text body', async ({ page }) => {
  await open(page)
  const before = await bounds(node(page, 'branch'))
  const childBefore = await bounds(node(page, 'descendant'))
  const title = await bounds(node(page, 'branch').locator('.topic-input'))
  const from = { x: title.x + title.width / 2, y: title.y + title.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 5, from.y)
  await page.mouse.move(from.x + 65, from.y + 140, { steps: 12 })
  await expect(page.getByTestId('drag-feedback')).toContainText('松开保留位置')
  await expect(editingTitle(page)).toHaveCount(0)
  await page.mouse.up()
  for (const [id, original] of [
    ['branch', before],
    ['descendant', childBefore],
  ] as const) {
    await expect.poll(async () => (await bounds(node(page, id))).x).toBeCloseTo(original.x + 60, 0)
    await expect.poll(async () => (await bounds(node(page, id))).y).toBeCloseTo(original.y + 140, 0)
  }
  await expect(node(page, 'branch')).toContainText('关联节点')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await bounds(node(page, 'branch'))).x).toBeCloseTo(before.x, 0)
})

test('Space, F2 and double-click enter editing without resizing or reflowing the title', async ({
  page,
}) => {
  await open(page)
  const branch = node(page, 'branch')
  const title = branch.locator('.topic-title')
  const before = await bounds(title)
  const childBefore = await bounds(node(page, 'descendant'))
  for (const activation of ['Space', 'F2', 'double-click']) {
    if (activation === 'double-click') await title.dblclick()
    else await page.keyboard.press(activation)
    await expect(editingTitle(page)).toBeFocused()
    const after = await bounds(title)
    for (const property of ['x', 'y', 'width', 'height'] as const)
      expect(after[property]).toBeCloseTo(before[property], 1)
    expect(await bounds(node(page, 'descendant'))).toEqual(childBefore)
    await page.keyboard.press('Escape')
    await expect(editingTitle(page)).toHaveCount(0)
    await expect(branch).toContainText('关联节点')
  }
})

test('dragging across an active title selects text without moving the topic', async ({ page }) => {
  await open(page)
  await page.keyboard.press('F2')
  const editor = editingTitle(page)
  await expect(editor).toBeFocused()
  const before = await bounds(node(page, 'branch'))
  // Collapse F2's range so the next gesture starts a fresh selection, rather than native text drag.
  await page.keyboard.press('ArrowRight')
  const text = await editor.evaluate((element) => {
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element.querySelector('[data-lexical-text]') ?? element)
    const rect = range.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  await page.mouse.move(text.x + 2, text.y + text.height / 2)
  await page.mouse.down()
  await page.mouse.move(text.x + text.width - 2, text.y + text.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect
    .poll(() => editor.evaluate((element) => element.ownerDocument.getSelection()?.toString()))
    .toBe('关联节点')
  expect(await bounds(node(page, 'branch'))).toEqual(before)
  await expect(page.getByTestId('drag-feedback')).toHaveCount(0)
  await page.keyboard.press('Backspace')
  await expect(editor).toHaveText('')
  await expect(editor).toBeFocused()
  // Let Lexical's macOS system-replacement guard expire before CDP insertText.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
  await page.keyboard.insertText('替换标题')
  await expect(editor).toHaveText('替换标题')
  await expect(editor).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(node(page, 'branch')).toContainText('替换标题')
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(4)
  await expect(editingTitle(page)).toBeFocused()
})

test('typing and native composition replace the selected inactive title without losing IME ownership', async ({
  page,
  context,
}) => {
  await open(page)
  await page.keyboard.type('Draft')
  await expect(editingTitle(page)).toHaveText('Draft')
  await page.keyboard.press('Escape')
  await expect(node(page, 'branch')).toContainText('关联节点')
  await expect
    .poll(() =>
      node(page, 'branch')
        .locator('.topic-input')
        .evaluate((element) => element.ownerDocument.getSelection()?.toString()),
    )
    .toBe('关联节点')
  const session = await context.newCDPSession(page)
  await session.send('Input.imeSetComposition', {
    text: '候选',
    selectionStart: 2,
    selectionEnd: 2,
  })
  await expect(editingTitle(page)).toHaveText('候选')
  await expect(editingTitle(page)).toBeFocused()
  await session.send('Input.imeSetComposition', {
    text: '中文输入',
    selectionStart: 4,
    selectionEnd: 4,
  })
  await expect(editingTitle(page)).toHaveText('中文输入')
  await session.send('Input.insertText', { text: '中文输入' })
  await session.detach()
  await page.keyboard.press('Enter')
  await expect(node(page, 'branch')).toContainText('中文输入')
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(4)
  await expect(editingTitle(page)).toBeFocused()
})
