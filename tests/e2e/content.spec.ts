import { closeDocumentTab } from '@tests/e2e/documents'
import { prepareNativeSave, prepareNativeOpen } from '@tests/electron/native-files'
import { completeDocumentCreation, openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'
import { expect, test, type Page } from '@tests/electron/fixture'
import { readFile } from 'node:fs/promises'
import { decodeBrainstorming } from '@tests/electron/codec'
import { imageBase64, attachmentBytes } from '@tests/fixtures/content'
import { composeChinese } from '@tests/e2e/ime'

const fileAction = async (page: Page, name: string) => {
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
  if (name === '新建导图') await completeDocumentCreation(page)
}

test('备注中文编辑、图片和附件在多画布复制排序、删除撤销、保存重开后完整保留', async ({
  page,
}, testInfo) => {
  page.on('dialog', (dialog) => dialog.accept())
  await openExample(page)
  await fileAction(page, '新建导图')
  const firstName = await page
    .getByRole('tablist', { name: '文档画布', exact: true })
    .getByRole('tab', { selected: true })
    .innerText()
  await page.getByRole('button', { name: '属性面板', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '属性面板', exact: true })
  const notes = panel.getByRole('textbox', { name: '主题备注', exact: true })
  await notes.click()
  await composeChinese(page, notes, '中文备注')
  await notes.press('Enter')
  await page.keyboard.insertText('第二行')
  const imagePicker = await prepareNativeOpen(page)
  await panel.getByRole('button', { name: '添加图片', exact: true }).click()
  await imagePicker.selectFile({
    name: '色卡.png',
    mimeType: 'image/png',
    buffer: Buffer.from(imageBase64, 'base64'),
  })
  const image = page.getByTestId('topic-root').getByRole('img', { name: '色卡.png', exact: true })
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(64)
  const attachmentPicker = await prepareNativeOpen(page)
  await panel.getByRole('button', { name: '添加附件', exact: true }).click()
  await attachmentPicker.selectFile({
    name: '资料.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(attachmentBytes),
  })
  await expect(panel.getByText('资料.bin', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('topic-content.png') })
  const extracted = await prepareNativeSave(page)
  await panel.getByRole('button', { name: '另存附件 资料.bin', exact: true }).click()
  const extractedPath = await extracted.path()
  if (!extractedPath) throw new Error('附件未导出')
  expect(await readFile(extractedPath)).toEqual(Buffer.from(attachmentBytes))
  await page.getByRole('button', { name: `画布菜单 ${firstName}`, exact: true }).click()
  await page.getByRole('menuitem', { name: '复制画布', exact: true }).click()
  const copyName = await page
    .getByRole('tablist', { name: '文档画布', exact: true })
    .getByRole('tab', { selected: true })
    .innerText()
  await expect(notes).toContainText('中文备注')
  await notes.fill('副本备注独立保存')
  await notes.press('Tab')
  await page.getByRole('button', { name: `画布菜单 ${copyName}`, exact: true }).click()
  await page.getByRole('menuitem', { name: '向左移动', exact: true }).click()
  await expect(
    page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab').first(),
  ).toHaveText(copyName)
  await page.getByRole('button', { name: `画布菜单 ${firstName}`, exact: true }).click()
  await page.getByRole('menuitem', { name: '删除画布', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(
    page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab'),
  ).toHaveCount(1)
  await dockAction(page, '撤销')
  await expect(
    page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab'),
  ).toHaveCount(2)
  await page
    .getByRole('tablist', { name: '文档画布', exact: true })
    .getByRole('tab', { name: firstName, exact: true })
    .click()
  await expect(notes).toHaveText('中文备注\n第二行')
  const download = await prepareNativeSave(page)
  await fileAction(page, '保存导图')
  const path = await download.path()
  if (!path) throw new Error('未生成原生文件')
  const workbook = await decodeBrainstorming(await readFile(path))
  expect(workbook.sheets.map(({ name }) => name)).toEqual([copyName, firstName])
  expect(workbook.sheets.map(({ document }) => document.topics.root?.notes)).toEqual([
    '副本备注独立保存',
    '中文备注\n第二行',
  ])
  for (const { document } of workbook.sheets)
    expect(Object.keys(document.assets ?? {})).toHaveLength(2)
  await fileAction(page, '新建导图')
  await closeDocumentTab(page, 1)
  const picker = await prepareNativeOpen(page)
  await fileAction(page, '打开导图')
  await picker.selectFile(path)
  for (const name of [copyName, firstName]) {
    await page
      .getByRole('tablist', { name: '文档画布', exact: true })
      .getByRole('tab', { name, exact: true })
      .click()
    await expect(image).toBeVisible()
    await expect(panel.getByText('资料.bin', { exact: true })).toBeVisible()
    await expect(notes).toContainText(name === firstName ? '中文备注' : '副本备注独立保存')
  }
})

test('损坏图片被拒绝，主题和已有备注保持不变', async ({ page }) => {
  await openExample(page)
  await page.getByRole('button', { name: '属性面板', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '属性面板', exact: true })
  await panel.getByRole('textbox', { name: '主题备注' }).fill('保留这份备注')
  const picker = await prepareNativeOpen(page)
  await panel.getByRole('button', { name: '添加图片', exact: true }).click()
  await picker.selectFile({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(panel.getByRole('textbox', { name: '主题备注' })).toHaveText('保留这份备注')
  await expect(page.getByTestId('topic-root')).toContainText('产品规划')
  await expect(panel.getByRole('img')).toHaveCount(0)
})
