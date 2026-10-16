import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { applyCommand, createDocument, createWorkbook } from '../../src/core'
import { decodeTrelyx, encodeTrelyx } from '../../src/formats/trelyx'
import { dockAction } from './dock'
import { openExample } from './workspace'

interface Box {
  x: number
  y: number
  width: number
  height: number
}
const leaves = ['vision-0', 'vision-1'] as const
const card = (page: Page, id: string) => page.locator(`[data-spatial-card-id="${id}"]`)
const title = (page: Page, id: string) => page.locator(`[data-spatial-topic-id="${id}"]`)

async function bounds(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('三维主题不可见')
  return box
}

async function save(page: Page) {
  const pending = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+s')
  const path = await (await pending).path()
  if (!path) throw new Error('没有生成保存文件')
  const document = decodeTrelyx(await readFile(path)).sheets[0]?.document
  if (!document) throw new Error('保存文件缺少画布')
  return { path, document }
}

async function marquee(page: Page, reverse = false) {
  const boxes = await Promise.all(leaves.map((id) => bounds(card(page, id))))
  const start = {
    x: Math.min(...boxes.map((box) => box.x)) - 10,
    y: Math.min(...boxes.map((box) => box.y)) - 10,
  }
  const end = {
    x: Math.max(...boxes.map((box) => box.x + box.width)) + 10,
    y: Math.max(...boxes.map((box) => box.y + box.height)) + 10,
  }
  const from = reverse ? end : start
  const to = reverse ? start : end
  await page.keyboard.down('Shift')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 15 })
  await expect(page.locator('[data-spatial-selection]')).toBeVisible()
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(page.locator('[data-spatial-selection]')).toHaveCount(0)
}

async function expectPosition(locator: Locator, original: Box) {
  await expect
    .poll(async () => {
      const current = await bounds(locator)
      return Math.hypot(current.x - original.x, current.y - original.y)
    })
    .toBeLessThan(1)
}

async function beginDrag(page: Page, id: string, dx = 28, dy = 22) {
  const from = await bounds(title(page, id))
  const x = from.x + from.width / 2
  const y = from.y + from.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
}

async function expectSharedPreview(
  page: Page,
  ids: readonly string[],
  originals: readonly Box[],
  sameDepth = true,
) {
  await expect
    .poll(async () => {
      const first = originals[0]
      const id = ids[0]
      if (!first || !id) throw new Error('缺少拖动主题')
      const moved = await bounds(card(page, id))
      return Math.hypot(moved.x - first.x, moved.y - first.y)
    })
    .toBeGreaterThan(8)
  const moved = await Promise.all(ids.map((id) => bounds(card(page, id))))
  const initial = originals[0]
  const current = moved[0]
  if (!initial || !current) throw new Error('缺少拖动预览')
  const dx = current.x - initial.x
  const dy = current.y - initial.y
  for (const [index, original] of originals.entries()) {
    const next = moved[index]
    if (!next) throw new Error('缺少分支预览')
    const nextDx = next.x - original.x
    const nextDy = next.y - original.y
    if (sameDepth) {
      expect(Math.abs(nextDx - dx)).toBeLessThan(2)
      expect(Math.abs(nextDy - dy)).toBeLessThan(2)
    } else {
      // A common world-space move projects differently for branches at different depths.
      expect(Math.hypot(nextDx, nextDy)).toBeGreaterThan(8)
      expect(
        (nextDx * dx + nextDy * dy) / (Math.hypot(nextDx, nextDy) * Math.hypot(dx, dy)),
      ).toBeGreaterThan(0.98)
    }
  }
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await openExample(page)
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  await expect(title(page, 'root')).toBeVisible()
  const closePanel = page.getByRole('button', { name: '关闭主题面板', exact: true })
  if (await closePanel.isVisible()) await closePanel.click()
  await expect(card(page, 'vision-0')).toBeInViewport()
})

test('三维双向 Shift 框选只选中完整卡片，不移动相机，修饰键可追加选区', async ({ page }) => {
  for (const reverse of [false, true]) {
    const root = await bounds(card(page, 'root'))
    await marquee(page, reverse)
    await expectPosition(card(page, 'root'), root)
    await expect(page.locator('[data-spatial-topic-id][aria-pressed="true"]')).toHaveCount(2)
    for (const id of leaves) await expect(title(page, id)).toHaveAttribute('aria-pressed', 'true')
  }
  await title(page, 'experience-0').click({ modifiers: ['ControlOrMeta'] })
  await expect(page.locator('[data-spatial-topic-id][aria-pressed="true"]')).toHaveCount(3)
  for (const id of [...leaves, 'experience-0'])
    await expect(title(page, id)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.save-status')).toContainText('本地草稿')
  await card(page, 'users').click({ position: { x: 4, y: 4 } })
  await expect(title(page, 'users')).toBeFocused()
  await page.keyboard.press('F2')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toHaveAttribute('data-topic-id', 'users')
  await page.keyboard.press('Escape')
})

test('三维选中组一起拖动挂接，二维一次撤销后保存重开恢复原层级', async ({ page }) => {
  await title(page, leaves[0]).click()
  await title(page, leaves[1]).click({ modifiers: ['ControlOrMeta'] })
  const originals = await Promise.all(leaves.map((id) => bounds(card(page, id))))
  const target = await bounds(card(page, 'users'))
  await beginDrag(page, leaves[0])
  await expectSharedPreview(page, leaves, originals)
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 })
  await expect(card(page, 'users')).toHaveAttribute('data-drop-target', 'true')
  await page.mouse.up()
  const moved = await save(page)
  expect(moved.document.topics.users?.children).toEqual(expect.arrayContaining([...leaves]))
  expect(moved.document.topics.vision?.children).toEqual([])
  for (const id of leaves) await expect(title(page, id)).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '二维视图', exact: true }).click()
  await dockAction(page, '撤销')
  const restored = await save(page)
  expect(restored.document.topics.vision?.children).toEqual(leaves)
  for (const id of leaves) expect(restored.document.topics.users?.children).not.toContain(id)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '打开导图', exact: true }).click()
  await (await chooser).setFiles(restored.path)
  await expect(page.locator('.save-status')).toHaveAttribute('title', basename(restored.path))
  for (const id of leaves) await expect(page.getByTestId(`topic-${id}`)).toBeVisible()
  expect((await save(page)).document.topics).toEqual(restored.document.topics)
})

test('三维拖动分支包含子主题，Escape 撤回预览且不产生文档变更', async ({ page }) => {
  const before = (await save(page)).document
  await title(page, 'vision').click()
  const ids = ['vision', ...leaves]
  const originals = await Promise.all(ids.map((id) => bounds(card(page, id))))
  const root = await bounds(card(page, 'root'))
  await beginDrag(page, 'vision', 34, 30)
  await expectSharedPreview(page, ids, originals, false)
  await expectPosition(card(page, 'root'), root)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  for (const [index, id] of ids.entries()) {
    const original = originals[index]
    if (!original) throw new Error('缺少原始位置')
    await expectPosition(card(page, id), original)
  }
  await expect(page.locator('[data-drop-target="true"]')).toHaveCount(0)
  expect((await save(page)).document).toEqual(before)
})

test('三维拖动在 pointercancel 和持键切换画布后取消，不污染任何 Sheet', async ({ page }) => {
  const baseline = decodeTrelyx(await readFile((await save(page)).path))
  const ids = ['vision', ...leaves]
  await title(page, 'vision').click()
  const originals = await Promise.all(ids.map((id) => bounds(card(page, id))))
  await beginDrag(page, 'vision')
  await expectSharedPreview(page, ids, originals, false)
  await title(page, 'vision').dispatchEvent('pointercancel', { pointerId: 1, bubbles: true })
  await page.mouse.up()
  for (const [index, id] of ids.entries()) {
    const original = originals[index]
    if (original) await expectPosition(card(page, id), original)
  }
  expect((await save(page)).document).toEqual(baseline.sheets[0]?.document)
  await beginDrag(page, 'vision')
  await expectSharedPreview(page, ids, originals, false)
  await page.getByRole('tab', { name: '产品总览', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: '用户研究', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.mouse.up()
  await expect(page.locator('[data-spatial-selection]')).toHaveCount(0)
  const saved = decodeTrelyx(await readFile((await save(page)).path))
  expect(saved.sheets).toEqual(baseline.sheets)
  await page.getByRole('tab', { name: '产品总览', exact: true }).click()
  for (const [index, id] of ids.entries()) {
    const original = originals[index]
    if (original) await expectPosition(card(page, id), original)
  }
})

test('三维游离组选区同步平移，只保存二维坐标并可在二维一次撤销', async ({ page }) => {
  const ids = ['floating-a', 'floating-b']
  let document = createDocument('游离组回归', 'spatial-floating-fixture')
  for (const [index, id] of ids.entries())
    document = applyCommand(document, {
      type: 'addFloatingTopic',
      id,
      title: id,
      x: 650,
      y: index * 220 - 110,
    })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '打开导图', exact: true }).click()
  await (
    await chooser
  ).setFiles({
    name: 'spatial-floating.trelyx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(encodeTrelyx(createWorkbook(document))),
  })
  await expect(page.locator('.save-status')).toHaveAttribute('title', 'spatial-floating.trelyx')
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  for (const [index, id] of ids.entries()) {
    await expect(card(page, id)).toBeInViewport()
    await title(page, id).click({ modifiers: index ? ['ControlOrMeta'] : [] })
  }
  const originals = await Promise.all(ids.map((id) => bounds(card(page, id))))
  await beginDrag(page, 'floating-a', 42, 36)
  await expectSharedPreview(page, ids, originals)
  await expect(page.locator('[data-drop-target="true"]')).toHaveCount(0)
  await page.mouse.up()
  const moved = (await save(page)).document
  const deltas = ids.map((id) => {
    const before = document.floatingPositions?.[id]
    const after = moved.floatingPositions?.[id]
    if (!before || !after) throw new Error('缺少游离主题坐标')
    expect(Object.keys(after).sort()).toEqual(['x', 'y'])
    return { x: after.x - before.x, y: after.y - before.y }
  })
  expect(Math.hypot(deltas[0]?.x ?? 0, deltas[0]?.y ?? 0)).toBeGreaterThan(10)
  expect(deltas[0]?.x).toBeCloseTo(deltas[1]?.x ?? NaN, 5)
  expect(deltas[0]?.y).toBeCloseTo(deltas[1]?.y ?? NaN, 5)
  expect(moved.floatingIds).toEqual(ids)
  await page.getByRole('button', { name: '二维视图', exact: true }).click()
  for (const id of ids) await expect(page.getByTestId(`topic-${id}`)).toBeVisible()
  await dockAction(page, '撤销')
  expect((await save(page)).document.floatingPositions).toEqual(document.floatingPositions)
})
