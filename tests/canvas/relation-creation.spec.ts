import { expect, test, type Page } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-画布自由绘图--mixed-selection&viewMode=story')
  await expect(node(page, 'branch')).toBeVisible()
}
const blank = (page: Page) => page.locator('.react-flow__pane')
const relations = (page: Page) => page.locator('.react-flow__edge-relation')
const start = async (page: Page) => {
  await page.getByRole('button', { name: '展开浮动工具栏', exact: true }).click()
  await page.getByRole('button', { name: '关联线', exact: true }).click()
}

test('two selected topics connect immediately; no selection chooses both endpoints', async ({
  page,
}) => {
  await open(page)
  await node(page, 'branch').click()
  await node(page, 'descendant').click({ modifiers: ['Meta'] })
  await start(page)
  await expect(relations(page)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await blank(page).click({ position: { x: 30, y: 160 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect(relations(page)).toHaveCount(0)
  await blank(page).click({ position: { x: 30, y: 160 } })
  await start(page)
  await node(page, 'branch').click()
  await expect(relations(page)).toHaveCount(0)
  await node(page, 'root').click()
  await expect(relations(page)).toHaveCount(1)
})

test('a double-click while connecting to blank space creates only one endpoint, atomically undoable', async ({
  page,
}) => {
  await open(page)
  await node(page, 'branch').click()
  await start(page)
  await blank(page).dblclick({ position: { x: 30, y: 160 } })
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(4)
  await expect(relations(page)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await blank(page).click({ position: { x: 30, y: 280 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.react-flow__node-topic')).toHaveCount(3)
  await expect(relations(page)).toHaveCount(0)
})

test('an orthogonal relation double-click edits its description without adding a waypoint', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=brainstorming-关联线路径--orthogonal&viewMode=story')
  const body = page.getByTestId('relation-body-editable')
  await expect(body).toBeAttached()
  const path = page.locator('#relation-editable')
  const before = await path.getAttribute('d')
  const point = await body.evaluate((element) => {
    const path = element as SVGPathElement
    const matrix = path.getScreenCTM()
    if (!matrix) throw new Error('Missing relation transform')
    for (const fraction of [0.25, 0.75, 0.15, 0.85, 0.35, 0.65]) {
      const local = path.getPointAtLength(path.getTotalLength() * fraction)
      const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix)
      if (document.elementFromPoint(screen.x, screen.y) === path)
        return { x: screen.x, y: screen.y }
    }
    throw new Error('No exposed relationship segment to double-click')
  })
  await page.mouse.dblclick(point.x, point.y)

  await expect(page.getByRole('textbox', { name: '编辑关联线名称', exact: true })).toBeFocused()
  await expect(path).toHaveAttribute('d', before ?? '')
})
