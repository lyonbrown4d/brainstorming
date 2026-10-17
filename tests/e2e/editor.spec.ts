import { closeDocumentTab } from '@tests/e2e/documents'
import { nativeRecoveryContents } from '@tests/electron/recovery'
import { nativeSession } from '@tests/electron/session'
import { prepareNativeSave, prepareNativeOpen } from '@tests/electron/native-files'
import { reloadWindow } from '@tests/electron/session'
import { completeDocumentCreation, openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'
import { expect, test } from '@tests/electron/fixture'
import { composeChinese } from '@tests/e2e/ime'

test.beforeEach(async ({ page }) => {
  await openExample(page)
})

test('新增、编辑、折叠、撤销、保存与重新打开', async ({ page }, testInfo) => {
  page.on('dialog', (dialog) => dialog.accept())
  await expect(page.getByTestId('topic-root')).toBeVisible()
  await expect(page.getByText('快捷记录灵感', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('brainstorming-v0.1.png') })
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建导图', exact: true }).click()
  await completeDocumentCreation(page)
  await page.getByTestId('topic-root').click()
  await page.keyboard.press('Tab')
  const input = page.getByRole('textbox', { name: '编辑主题标题' })
  await input.fill('项目计划')
  await page.keyboard.press('Tab')
  await input.fill('第一阶段')
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await expect(page.locator('.topic-title').getByText('第一阶段', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '折叠 项目计划', exact: true }).click()
  await expect(page.locator('.topic-title').getByText('第一阶段', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '展开 项目计划', exact: true }).click()
  await expect(page.locator('.topic-title').getByText('第一阶段', { exact: true })).toBeVisible()
  await page.locator('.topic-title').filter({ hasText: '第一阶段' }).click()
  await page.keyboard.press('Delete')
  await expect(page.locator('.topic-title').getByText('第一阶段', { exact: true })).toHaveCount(0)
  await dockAction(page, '撤销')
  await expect(page.locator('.topic-title').getByText('第一阶段', { exact: true })).toBeVisible()
  const downloadPromise = await prepareNativeSave(page)
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '保存导图', exact: true }).click()
  const download = downloadPromise
  const path = await download.path()
  if (!path) throw new Error('保存未生成文件')
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建导图', exact: true }).click()
  await completeDocumentCreation(page)
  await closeDocumentTab(page, 1)
  const picker = await prepareNativeOpen(page)
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '打开导图', exact: true }).click()
  await picker.selectFile(path)
  await expect(page.locator('.topic-title').getByText('项目计划', { exact: true })).toBeVisible()
  await expect(page.locator('.topic-title').getByText('第一阶段', { exact: true })).toBeVisible()
})

test('无效文件不替换当前文档，输入法 Enter 不创建主题', async ({ page }) => {
  const title = page.getByTestId('topic-root')
  await title.dblclick()
  const input = page.getByRole('textbox', { name: '编辑主题标题' })
  const count = await page.locator('.react-flow__node').count()
  await composeChinese(page, input, '中文思维导图')
  await expect(input).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(count)
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await expect(title).toContainText('中文思维导图')
  page.on('dialog', (dialog) => dialog.accept())
  const picker = await prepareNativeOpen(page)
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '打开导图', exact: true }).click()
  await picker.selectFile({
    name: 'broken.brainstorming',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(title).toContainText('中文思维导图')
})

test('恢复文档需要用户选择，刷新后可以恢复', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByTestId('topic-root').dblclick()
  await page.getByRole('textbox', { name: '编辑主题标题' }).fill('恢复的想法')
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await expect
    .poll(() => nativeRecoveryContents(nativeSession(page).directory))
    .toContain('恢复的想法')
  await reloadWindow(page)
  await expect(page.getByRole('button', { name: /恢复/ })).toBeVisible()
  await expect(page.getByTestId('topic-root')).toHaveCount(0)
  await page.getByRole('button', { name: /恢复/ }).click()
  await expect(page.getByTestId('topic-root')).toContainText('恢复的想法')
})

test('拖动分支更换父级、方向可撤销，帮助弹窗支持键盘关闭', async ({ page }) => {
  const branches = page.locator('.topic-title')
  await branches.getByText('产品愿景', { exact: true }).click()
  const from = await page.getByTestId('topic-vision').boundingBox()
  const to = await page.getByTestId('topic-experience').boundingBox()
  if (!from || !to) throw new Error('分支未显示')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  await page.getByRole('button', { name: '属性面板', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '移动到父主题' })).toHaveText('核心体验')
  await dockAction(page, '撤销')
  await expect(page.getByRole('combobox', { name: '移动到父主题' })).toHaveText('产品规划')
  await page.getByRole('button', { name: '左侧', exact: true }).click()
  await expect(page.getByTestId('topic-vision')).toHaveClass(/side-left/)
  await page.getByRole('button', { name: '键盘快捷键', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
