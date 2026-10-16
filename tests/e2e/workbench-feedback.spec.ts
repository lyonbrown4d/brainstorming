import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { decodeTrelyx } from '../../src/formats/trelyx'
import { openExample } from './workspace'

type Mode = '2d' | '3d'
const feedback = (page: Page) => page.getByTestId('drag-feedback')
const card = (page: Page, mode: Mode, id: string) =>
  mode === '2d' ? page.getByTestId(`topic-${id}`) : page.locator(`[data-spatial-card-id="${id}"]`)
const topic = (page: Page, mode: Mode, id: string) =>
  mode === '2d' ? card(page, mode, id) : page.locator(`[data-spatial-topic-id="${id}"]`)

async function box(locator: Locator) {
  const bounds = await locator.boundingBox()
  if (!bounds) throw new Error('拖动主题不可见')
  return bounds
}

async function openCanvas(page: Page, mode: Mode) {
  await openExample(page)
  if (mode === '3d') {
    await page.getByRole('button', { name: '三维视图', exact: true }).click()
    await expect(topic(page, mode, 'root')).toBeVisible()
  }
  const close = page.getByRole('button', { name: '关闭主题面板', exact: true })
  if (await close.isVisible()) await close.click()
  await expect(card(page, mode, 'vision-0')).toBeInViewport()
}

async function startDrag(page: Page, mode: Mode) {
  const from = await box(topic(page, mode, 'vision-0'))
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 30, start.y + 24, { steps: 8 })
  await expect(feedback(page)).toBeVisible()
}

async function saveWorkbook(page: Page) {
  const download = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+s')
  const path = await (await download).path()
  if (!path) throw new Error('没有生成保存文件')
  return decodeTrelyx(await readFile(path))
}

for (const mode of ['2d', '3d'] as const) {
  test(`${mode} 拖动组显示共同落点与数量，松手清除反馈`, async ({ page }) => {
    await openCanvas(page, mode)
    await topic(page, mode, 'vision-0').click()
    await topic(page, mode, 'vision-1').click({ modifiers: ['ControlOrMeta'] })
    const target = await box(card(page, mode, 'users'))
    await startDrag(page, mode)
    await expect(feedback(page)).toContainText('2 个主题')
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 })
    await expect(feedback(page)).toHaveAttribute('data-drop-target', 'users')
    await expect(feedback(page)).toContainText('移入「目标用户」')
    await expect(feedback(page)).toHaveAttribute('role', 'status')
    await page.mouse.up()
    await expect(feedback(page)).toHaveCount(0)
    const saved = await saveWorkbook(page)
    expect(saved.sheets[0]?.document.topics.users?.children).toEqual(
      expect.arrayContaining(['vision-0', 'vision-1']),
    )
  })

  test(`${mode} Esc、指针取消和切换 Sheet 清除反馈并保留文件`, async ({ page }) => {
    await openCanvas(page, mode)
    const before = await saveWorkbook(page)
    await startDrag(page, mode)
    await page.keyboard.press('Escape')
    await expect(feedback(page)).toHaveCount(0)
    await page.mouse.up()

    await startDrag(page, mode)
    await topic(page, mode, 'vision-0').dispatchEvent('pointercancel', {
      pointerId: 1,
      bubbles: true,
    })
    await expect(feedback(page)).toHaveCount(0)
    await page.mouse.up()

    await startDrag(page, mode)
    await page.getByRole('tab', { name: '产品总览', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: '用户研究', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(feedback(page)).toHaveCount(0)
    await page.mouse.up()
    expect((await saveWorkbook(page)).sheets).toEqual(before.sheets)
    await page.getByRole('tab', { name: '产品总览', exact: true }).click()
    await expect(feedback(page)).toHaveCount(0)
  })
}
