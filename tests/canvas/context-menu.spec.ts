import { expect, test, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-画布自由绘图--mixed-selection&viewMode=story')
  await expect(node(page, 'descendant')).toBeVisible()
}
const action = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true })

test('right-click targets the clicked branch; deletion and undo preserve the rest of the map', async ({
  page,
}) => {
  await open(page)
  await node(page, 'root').click()
  await node(page, 'branch').click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(node(page, 'branch')).toHaveClass(/selected/)
  await expect(node(page, 'root')).not.toHaveClass(/selected/)
  await page.screenshot({ path: 'test-results/canvas/context-menu.png' })
  await action(page, '删除当前主题，保留子主题').click()
  await expect(node(page, 'branch')).toHaveCount(0)
  await expect(node(page, 'descendant')).toBeVisible()
  await expect(page.locator('.react-flow__edge[data-id="edge-descendant"]')).toHaveAttribute(
    'aria-label',
    'Edge from root to descendant',
  )
  await page.keyboard.press('ControlOrMeta+z')
  await expect(node(page, 'branch')).toBeVisible()
  await expect(page.locator('.react-flow__edge[data-id="edge-descendant"]')).toHaveAttribute(
    'aria-label',
    'Edge from branch to descendant',
  )
})

test('right-click preserves multiple selected nodes; Escape restores direct typing to the topic', async ({
  page,
}) => {
  await open(page)
  await node(page, 'branch').click()
  await node(page, 'descendant').click({ modifiers: ['ControlOrMeta'] })
  await node(page, 'branch').click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(node(page, 'branch')).toHaveClass(/selected/)
  await expect(node(page, 'descendant')).toHaveClass(/selected/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(node(page, 'branch').locator('.topic-input')).toBeFocused()
  await page.keyboard.insertText('右键后继续输入')
  await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toHaveText(
    '右键后继续输入',
  )
  await page.keyboard.press('Escape')
  await expect(node(page, 'branch')).toContainText('关联节点')
})

test('blank-canvas menu creates a floating topic at its click position and supports one undo', async ({
  page,
}) => {
  await open(page)
  await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 30, y: 160 } })
  await action(page, '新增游离主题').click()
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(4)
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('游离想法')
  await page.locator('.react-flow__pane').click({ position: { x: 30, y: 280 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.react-flow__node-topic').filter({ hasText: '游离想法' })).toHaveCount(
    0,
  )
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(3)
})

test('an active title keeps its native text context menu instead of canvas commands', async ({
  page,
}) => {
  await open(page)
  await node(page, 'branch').dblclick()
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await editor.click({ button: 'right' })
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(editor).toBeFocused()
})
