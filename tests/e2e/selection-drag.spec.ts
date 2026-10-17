import { prepareNativeSave } from '@tests/electron/native-files'
import { expect, test, type Page } from '@tests/electron/fixture'
import { readFile } from 'node:fs/promises'
import { decodeBrainstorming } from '@tests/electron/codec'
import { openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'

const savedDocument = async (page: Page) => {
  const pending = await prepareNativeSave(page)
  await page.keyboard.press('ControlOrMeta+s')
  const path = await pending.path()
  if (!path) throw new Error('没有生成保存文件')
  const document = (await decodeBrainstorming(await readFile(path))).sheets[0]?.document
  if (!document) throw new Error('保存文件缺少画布')
  return document
}

test('空白左键拖动平移画布，释放 Shift 框选后仍可平移', async ({ page }) => {
  await openExample(page)
  const pane = page.locator('.react-flow__pane')
  const bounds = await pane.boundingBox()
  if (!bounds) throw new Error('缺少画布')
  const viewport = page.locator('.react-flow__viewport')
  const selected = page.locator('.react-flow__node.selected')
  const count = await selected.count()
  const before = await viewport.getAttribute('style')
  const start = { x: bounds.x + bounds.width - 50, y: bounds.y + 40 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 120, start.y + 60, { steps: 12 })
  await page.mouse.up()
  await expect(viewport).not.toHaveAttribute('style', before ?? '')
  await expect(selected).toHaveCount(count)
  const panned = await viewport.getAttribute('style')

  await page.keyboard.down('Shift')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 60, start.y + 30, { steps: 8 })
  await expect(page.locator('.react-flow__selection')).toBeVisible()
  await expect(viewport).toHaveAttribute('style', panned ?? '')
  await page.mouse.up()
  await page.keyboard.up('Shift')

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 80, start.y + 40, { steps: 8 })
  await page.mouse.up()
  await expect(viewport).not.toHaveAttribute('style', panned ?? '')
})

test('拖框选择两个主题，拖动任一主题一起移动，撤销一次并保存恢复原层级', async ({ page }) => {
  const unmeasured: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('error#015')) unmeasured.push(message.text())
  })
  await openExample(page)
  const ids = ['vision-0', 'vision-1']
  const cards = ids.map((id) => page.getByTestId(`topic-${id}`))
  const boxes = await Promise.all(cards.map((card) => card.boundingBox()))
  const [first, second] = boxes
  if (!first || !second) throw new Error('框选主题不可见')
  const left = Math.min(first.x, second.x) - 12
  const top = Math.min(first.y, second.y) - 12
  const right = Math.max(first.x + first.width, second.x + second.width) + 12
  const bottom = Math.max(first.y + first.height, second.y + second.height) + 12
  const viewport = page.locator('.react-flow__viewport')
  const before = await viewport.getAttribute('style')
  await page.keyboard.down('Shift')
  await page.mouse.move(left, top)
  await page.mouse.down()
  await page.mouse.move(right, bottom, { steps: 15 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(viewport).toHaveAttribute('style', before ?? '')
  for (const id of ids)
    await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveClass(/selected/u)
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2)

  const target = await page.getByTestId('topic-users').boundingBox()
  if (!target) throw new Error('目标分支不可见')
  const from = { x: first.x + first.width / 2, y: first.y + first.height / 2 }
  const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 25, from.y + 20, { steps: 6 })
  const moving = await Promise.all(cards.map((card) => card.boundingBox()))
  if (!moving[0] || !moving[1]) throw new Error('拖动预览缺少主题')
  expect(moving[0].x - first.x).toBeCloseTo(moving[1].x - second.x, 0)
  expect(moving[0].y - first.y).toBeCloseTo(moving[1].y - second.y, 0)
  await page.mouse.move(to.x, to.y, { steps: 20 })
  await expect(page.getByTestId('topic-users')).toHaveClass(/drop-target/u)
  await page.mouse.up()
  expect(unmeasured).toEqual([])
  const moved = await savedDocument(page)
  expect(moved.topics.users?.children).toEqual(expect.arrayContaining(ids))
  expect(moved.topics.vision?.children).not.toEqual(expect.arrayContaining(ids))
  for (const id of ids)
    await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveClass(/selected/u)

  await dockAction(page, '撤销')
  const restored = await savedDocument(page)
  expect(restored.topics.vision?.children).toEqual(expect.arrayContaining(ids))
  for (const id of ids) expect(restored.topics.users?.children).not.toContain(id)
})
