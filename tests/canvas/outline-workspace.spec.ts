import { expect, test, type Locator, type Page } from '@playwright/test'

const workspace = (page: Page) => page.getByRole('region', { name: '大纲工作区', exact: true })
const row = (page: Page, id: string) => workspace(page).locator(`[data-outline-topic="${id}"]`)
const title = (page: Page) =>
  workspace(page).getByRole('textbox', { name: '大纲主题名称', exact: true })
const rootOrder = (page: Page) =>
  workspace(page)
    .locator('[data-outline-parent="root"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-outline-topic')),
    )
const open = async (page: Page, story = 'editing') => {
  await page.goto(`/iframe.html?id=brainstorming-大纲工作区--${story}&viewMode=story`)
  await expect(workspace(page)).toBeVisible({ timeout: 15_000 })
  await expect(row(page, 'root')).toBeVisible({ timeout: 15_000 })
}
const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Missing outline geometry')
  return box
}
const dragTo = async (
  page: Page,
  id: string,
  target: string,
  position: 'before' | 'inside' | 'after',
  cancel = false,
) => {
  await row(page, id).scrollIntoViewIfNeeded()
  const handle = await bounds(row(page, id).getByRole('button', { name: /^拖动主题/ }))
  const zone = await bounds(row(page, target).locator(`[data-outline-drop="${position}"]`))
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 8, handle.y + handle.height / 2, { steps: 3 })
  await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, { steps: 12 })
  await expect(row(page, target).locator(`[data-outline-drop="${position}"]`)).toHaveAttribute(
    'data-drop-active',
    'true',
  )
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up()
}

test('outline edits use one Lexical editor, native IME, sibling creation and undoable indentation', async ({
  page,
  context,
}) => {
  await open(page)
  await expect(title(page)).toHaveCount(0)
  await row(page, 'users').getByRole('button', { name: '目标用户', exact: true }).dblclick()
  await expect(title(page)).toBeFocused()
  await expect(workspace(page).locator('[contenteditable="true"]')).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+a')
  const session = await context.newCDPSession(page)
  await session.send('Input.imeSetComposition', {
    text: '中文想法',
    selectionStart: 4,
    selectionEnd: 4,
  })
  await expect(title(page)).toHaveText('中文想法')
  await expect(workspace(page).getByRole('treeitem')).toHaveCount(13)
  await session.send('Input.insertText', { text: '中文想法' })
  await session.detach()
  await page.keyboard.press('Enter')
  await expect(row(page, 'users')).toContainText('中文想法')
  await expect(title(page)).toBeFocused()
  const newRow = workspace(page)
    .getByRole('treeitem')
    .filter({ has: page.getByRole('textbox', { name: '大纲主题名称', exact: true }) })
  const id = await newRow.getAttribute('data-outline-topic')
  if (!id) throw new Error('Missing newly created outline topic')
  await expect(newRow).toHaveAttribute('data-outline-parent', 'root')
  await page.keyboard.press('Tab')
  await expect(row(page, id)).toHaveAttribute('data-outline-parent', 'users')
  await expect(title(page)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(row(page, id)).toHaveAttribute('data-outline-parent', 'root')
  await page.screenshot({ path: 'test-results/outline-workspace.png' })
  await page.keyboard.press('Escape')
  await workspace(page).getByRole('button', { name: '撤销', exact: true }).click()
  await expect(row(page, id)).toHaveAttribute('data-outline-parent', 'users')
  await workspace(page).getByRole('button', { name: '撤销', exact: true }).click()
  await expect(row(page, id)).toHaveAttribute('data-outline-parent', 'root')
  await workspace(page).getByRole('button', { name: '撤销', exact: true }).click()
  await expect(row(page, id)).toHaveCount(0)
  await expect(row(page, 'users')).toContainText('中文想法')
})

test('real pointer drops reparent, order, cancel and undo whole subtrees', async ({ page }) => {
  await open(page, 'floating-ideas')
  await expect(row(page, 'floating')).toHaveCount(1)
  await expect(row(page, 'floating')).toHaveAttribute('data-outline-depth', '0')
  await dragTo(page, 'users', 'vision', 'inside')
  await expect(row(page, 'users')).toHaveAttribute('data-outline-parent', 'vision')
  await expect(row(page, 'users-0')).toHaveAttribute('data-outline-parent', 'users')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(row(page, 'users')).toHaveAttribute('data-outline-parent', 'root')
  await dragTo(page, 'users', 'experience', 'after')
  await expect
    .poll(async () => (await rootOrder(page)).slice(0, 3))
    .toEqual(['vision', 'experience', 'users'])
  await page.keyboard.press('ControlOrMeta+z')
  await expect
    .poll(async () => (await rootOrder(page)).slice(0, 3))
    .toEqual(['vision', 'users', 'experience'])
  await dragTo(page, 'users', 'vision', 'before')
  await expect.poll(async () => (await rootOrder(page)).slice(0, 2)).toEqual(['users', 'vision'])
  await dragTo(page, 'users', 'vision', 'inside', true)
  await expect(row(page, 'users')).toHaveAttribute('data-outline-parent', 'root')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await rootOrder(page)).slice(0, 2)).toEqual(['vision', 'users'])
  await dragTo(page, 'floating', 'users', 'inside')
  await expect(row(page, 'floating')).toHaveCount(1)
  await expect(row(page, 'floating')).toHaveAttribute('data-outline-parent', 'users')
})

test('outline is a scoped work view and returns to the same mounted canvas and camera', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=brainstorming-大纲工作区--canvas-switch&viewMode=story')
  const canvas = page.locator('[data-view-mode="2d"]')
  await expect(page.getByTestId('topic-users')).toBeVisible()
  const viewport = page.locator('.react-flow__viewport')
  const transform = await viewport.getAttribute('style')
  await canvas.evaluate((element) => {
    element.setAttribute('data-outline-retained', 'true')
  })
  await page.getByRole('button', { name: '展开浮动工具栏', exact: true }).hover()
  await page.getByRole('button', { name: '大纲编辑', exact: true }).click()
  await expect(workspace(page)).toBeVisible()
  await row(page, 'users').getByRole('button', { name: '目标用户', exact: true }).click()
  await workspace(page).getByRole('button', { name: '返回画布', exact: true }).click()
  await expect(workspace(page)).toHaveCount(0)
  await expect(canvas).toHaveAttribute('data-outline-retained', 'true')
  await expect(viewport).toHaveAttribute('style', transform ?? '')
  await expect(page.getByTestId('topic-users')).toHaveClass(/is-selected/)
  await page.getByRole('button', { name: '展开浮动工具栏', exact: true }).hover()
  await page.getByRole('button', { name: '大纲编辑', exact: true }).click()
  await page.getByRole('tab', { name: '第二张', exact: true }).click()
  await expect(workspace(page)).toHaveCount(0)
  await page.getByRole('tab', { name: '产品规划', exact: true }).click()
  await expect(workspace(page)).toBeVisible()
})

test('large outlines virtualize inactive titles and retain the selected editor during scrolling', async ({
  page,
}) => {
  await open(page, 'large-outline')
  const tree = workspace(page).getByRole('tree', { name: '可编辑大纲', exact: true })
  expect(await tree.getByRole('treeitem').count()).toBeLessThan(60)
  await row(page, 'large-0').getByRole('button', { name: '主题 1', exact: true }).dblclick()
  await expect(title(page)).toBeFocused()
  await tree.hover()
  await page.mouse.wheel(0, 100000)
  await expect(row(page, 'large-1199')).toBeVisible()
  await expect(title(page)).toHaveCount(1)
  expect(await tree.getByRole('treeitem').count()).toBeLessThan(60)
})

test('scrolling a selected inactive row away preserves outline F2 editing', async ({ page }) => {
  await open(page, 'large-outline')
  const tree = workspace(page).getByRole('tree', { name: '可编辑大纲', exact: true })
  await row(page, 'large-0').getByRole('button', { name: '主题 1', exact: true }).click()
  await expect(row(page, 'large-0')).toBeFocused()
  await expect(title(page)).toHaveCount(0)
  await tree.hover()
  await page.mouse.wheel(0, 100000)
  await expect(row(page, 'large-1199')).toBeVisible()
  await expect(row(page, 'large-0')).toBeFocused()
  await page.keyboard.press('F2')
  await expect(title(page)).toBeFocused()
  await expect(title(page)).toHaveText('主题 1')
  await expect(row(page, 'large-0')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toHaveCount(0)
})
