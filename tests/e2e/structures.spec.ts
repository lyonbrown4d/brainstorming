import { completeDocumentCreation, openExample } from '@tests/e2e/workspace'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { applyCommand, createExampleDocument, createWorkbook } from '@core'
import { decodeTrelyx, encodeTrelyx } from '@formats/trelyx'
import { structureOptions } from '@renderer/components/documents/structureOptions'
import { dockAction } from '@tests/e2e/dock'

const fileAction = async (page: Page, name: string) => {
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
  if (name === '新建导图') await completeDocumentCreation(page)
}
const openPicker = async (page: Page) => {
  await dockAction(page, '图形结构')
  return page.getByRole('dialog', { name: '图形结构', exact: true })
}
const save = async (page: Page) => {
  const download = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+s')
  const path = await (await download).path()
  if (!path) throw new Error('保存未生成原生文件')
  return { path, workbook: decodeTrelyx(await readFile(path)) }
}

test('缩略图可用键盘应用全部结构，切换保留主题并支持一次撤销重做', async ({ page }, testInfo) => {
  await openExample(page)
  await expect(page.getByTestId('topic-root')).toBeVisible()
  const titles = (await page.locator('.topic-title').allTextContents()).sort()
  const picker = await openPicker(page)
  for (const { value, label } of structureOptions) {
    const choice = picker.getByRole('button', { name: `应用${label}`, exact: true })
    await choice.focus()
    await page.keyboard.press('Enter')
    await expect(choice).toHaveAttribute('aria-pressed', 'true')
    const decorationKind = value.startsWith('brace-')
      ? 'brace'
      : value.startsWith('tree-table-') || value === 'matrix'
        ? 'cell'
        : value.startsWith('timeline') || value === 'fishbone'
          ? 'spine'
          : null
    if (decorationKind) {
      const decoration = page
        .getByTestId('structure-geometry')
        .locator(`[data-structure-kind="${decorationKind}"]`)
        .first()
      if (decorationKind === 'spine') {
        // A horizontal or vertical SVG spine has one zero bounding dimension.
        await expect(decoration).toHaveAttribute('d', /[ML]/)
        await expect
          .poll(() =>
            decoration.evaluate((element) => {
              const bounds = element.getBoundingClientRect()
              return Math.max(bounds.width, bounds.height)
            }),
          )
          .toBeGreaterThan(0)
      } else await expect(decoration).toBeVisible()
    }
    await expect
      .poll(async () => (await page.locator('.topic-title').allTextContents()).sort())
      .toEqual(titles)
    if (['tree-down', 'brace-right', 'fishbone', 'matrix', 'tree-table-right'].includes(value)) {
      await page.keyboard.press('Escape')
      await page.screenshot({ path: testInfo.outputPath(`${value}.png`) })
      await openPicker(page)
    }
  }
  await page.keyboard.press('Escape')
  await dockAction(page, '撤销')
  await openPicker(page)
  await expect(page.getByRole('button', { name: '应用向右树形表格', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Escape')
  await dockAction(page, '重做')
  await openPicker(page)
  await expect(page.getByRole('button', { name: '应用向下树形表格', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Escape')
  const { workbook } = await save(page)
  expect(workbook.sheets[0]?.document.settings?.layout).toBe('tree-table-down')
})

test('当前画布清除根覆盖，保留批量分支结构；重置可撤销并随原生文件重新打开', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  let document = applyCommand(createExampleDocument(), {
    type: 'setTopicStructure',
    topicId: 'root',
    structure: 'logic-left',
  })
  document = applyCommand(document, {
    type: 'setTopicStructure',
    topicId: 'vision',
    structure: 'brace-right',
  })
  const originalTitles = Object.fromEntries(
    Object.values(document.topics).map((topic) => [topic.id, topic.title]),
  )
  await openExample(page)
  const chooser = page.waitForEvent('filechooser')
  await fileAction(page, '打开导图')
  await (
    await chooser
  ).setFiles({
    name: '混合结构.trelyx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(encodeTrelyx(createWorkbook(document))),
  })
  let picker = await openPicker(page)
  await expect(picker.getByRole('button', { name: '应用向左逻辑图', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await picker.getByRole('button', { name: '应用向下树形图', exact: true }).click()
  await page.keyboard.press('Escape')
  let saved = await save(page)
  const first = saved.workbook.sheets[0]?.document
  expect(first?.settings?.layout).toBe('tree-down')
  expect(first?.topics.root?.structure).toBeUndefined()
  expect(first?.topics.vision?.structure).toBe('brace-right')
  await page.getByTestId('topic-vision').click()
  await page.getByTestId('topic-experience').click({ modifiers: ['Shift'] })
  picker = await openPicker(page)
  await picker.getByRole('button', { name: '所选分支', exact: true }).click()
  await expect(picker.getByRole('status')).toContainText('所选 2 个主题')
  await picker.getByRole('button', { name: '应用垂直时间线', exact: true }).click()
  await picker.getByRole('button', { name: '恢复跟随上级结构', exact: true }).click()
  await expect(
    picker.getByRole('button', { name: '恢复跟随上级结构', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await dockAction(page, '撤销')
  picker = await openPicker(page)
  await expect(picker.getByRole('button', { name: '应用垂直时间线', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Escape')
  saved = await save(page)
  const restored = saved.workbook.sheets[0]?.document
  expect(restored?.topics.vision?.structure).toBe('timeline-vertical')
  expect(restored?.topics.experience?.structure).toBe('timeline-vertical')
  expect(
    Object.fromEntries(
      Object.values(restored?.topics ?? {}).map((topic) => [topic.id, topic.title]),
    ),
  ).toEqual(originalTitles)
  await fileAction(page, '新建导图')
  const reopen = page.waitForEvent('filechooser')
  await fileAction(page, '打开导图')
  await (await reopen).setFiles(saved.path)
  await page.getByTestId('topic-vision').click()
  picker = await openPicker(page)
  await picker.getByRole('button', { name: '所选分支', exact: true }).click()
  await expect(picker.getByRole('button', { name: '应用垂直时间线', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('同一文件的画布独立保存结构与撤销历史', async ({ page }) => {
  await openExample(page)
  let picker = await openPicker(page)
  await picker.getByRole('button', { name: '应用向右括号图', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: '用户研究', exact: true }).click()
  picker = await openPicker(page)
  await expect(picker.getByRole('button', { name: '应用左右导图', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await picker.getByRole('button', { name: '应用向上树形图', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: '产品总览', exact: true }).click()
  await dockAction(page, '撤销')
  picker = await openPicker(page)
  await expect(picker.getByRole('button', { name: '应用左右导图', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: '用户研究', exact: true }).click()
  picker = await openPicker(page)
  await expect(picker.getByRole('button', { name: '应用向上树形图', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Escape')
  const { workbook } = await save(page)
  expect(workbook.sheets[0]?.document.settings?.layout).toBeUndefined()
  expect(workbook.sheets[1]?.document.settings?.layout).toBe('tree-up')
})
