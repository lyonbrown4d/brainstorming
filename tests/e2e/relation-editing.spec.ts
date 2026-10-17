import { expect, test, type Page } from '@playwright/test'
import { dockAction } from '@tests/e2e/dock'
import { openExample } from '@tests/e2e/workspace'

const createRelation = async (page: Page): Promise<void> => {
  await page.getByTestId('topic-vision').click()
  await dockAction(page, '关联线')
  await page.getByTestId('topic-experience').click()
  const input = page.getByRole('textbox', { name: '编辑关联线名称', exact: true })
  await input.fill('愿景关联体验')
  await input.press('Enter')
}

const selectRelationLine = async (page: Page): Promise<void> => {
  const line = page.locator('.react-flow__edge-relation .react-flow__edge-interaction')
  const point = await line.evaluate((element) => {
    const path = element as SVGPathElement
    const local = path.getPointAtLength(path.getTotalLength() * 0.25)
    const matrix = path.getScreenCTM()
    if (!matrix) throw new Error('关联线不可见')
    const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  })
  await page.mouse.click(point.x, point.y)
}

test.beforeEach(async ({ page }) => {
  await openExample(page)
  await createRelation(page)
})

test('选择关联线后删除并撤销，不删除端点主题', async ({ page }) => {
  await selectRelationLine(page)
  await expect(page.locator('.react-flow__edge-relation')).toHaveClass(/selected/)
  await page.keyboard.press('Backspace')
  await expect(page.locator('.react-flow__edge-relation')).toHaveCount(0)
  await expect(page.getByTestId('topic-vision')).toBeVisible()
  await expect(page.getByTestId('topic-experience')).toBeVisible()
  await dockAction(page, '撤销')
  await expect(
    page.getByRole('button', { name: '关联线：愿景关联体验', exact: true }),
  ).toBeVisible()
})

test('关联线标签支持文字选择、局部修改，Escape 取消不会在 blur 后提交', async ({ page }) => {
  const label = page.getByRole('button', { name: '关联线：愿景关联体验', exact: true })
  await label.dblclick()
  const input = page.getByRole('textbox', { name: '编辑关联线名称', exact: true })
  await input.press('End')
  await input.press('Shift+ArrowLeft')
  await input.press('Shift+ArrowLeft')
  await expect
    .poll(() =>
      input.evaluate((element: HTMLInputElement) =>
        element.value.slice(element.selectionStart ?? 0, element.selectionEnd ?? 0),
      ),
    )
    .toBe('体验')
  await input.press('Backspace')
  await input.press('Enter')
  await expect(page.getByRole('button', { name: '关联线：愿景关联', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关联线：愿景关联', exact: true }).dblclick()
  await input.fill('应当取消的文字')
  await input.press('Escape')
  await page.getByTestId('topic-vision').click()
  await expect(page.getByRole('button', { name: '关联线：愿景关联', exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '关联线：应当取消的文字', exact: true }),
  ).toHaveCount(0)
})

test('拖动关联线端点重连，取消不改动，完成后可一次撤销', async ({ page }) => {
  await selectRelationLine(page)
  const edge = page.locator('.react-flow__edge-relation')
  const path = edge.locator('.react-flow__edge-path')
  const before = await path.getAttribute('d')
  const updater = edge.locator('.react-flow__edgeupdater-target')
  const handle = await updater.boundingBox()
  if (!handle) throw new Error('关联线端点不可拖动')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(30, 180, { steps: 8 })
  await page.mouse.up()
  await expect(path).toHaveAttribute('d', before ?? '')
  const next = await updater.boundingBox()
  const target = await page
    .getByTestId('topic-root')
    .locator('[data-handleid="target-right"]')
    .boundingBox()
  if (!next || !target) throw new Error('重连端点或目标缺失')
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(path).not.toHaveAttribute('d', before ?? '')
  await expect(
    page.getByRole('button', { name: '关联线：愿景关联体验', exact: true }),
  ).toBeVisible()
  await dockAction(page, '撤销')
  await expect(path).toHaveAttribute('d', before ?? '')
})
