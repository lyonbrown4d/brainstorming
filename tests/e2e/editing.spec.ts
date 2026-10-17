import { prepareNativeSave } from '@tests/electron/native-files'
import { openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'
import { expect, test } from '@tests/electron/fixture'
import { readFile } from 'node:fs/promises'
import { decodeTrelyx } from '@formats/trelyx'
import { composeChinese } from '@tests/e2e/ime'

test('选中后连续输入不丢首字，中文组词、换行、取消和整次撤销正常', async ({ page }) => {
  await openExample(page)
  const input = page.getByTestId('topic-root').locator('[contenteditable="true"]')
  await page.getByTestId('topic-root').click()
  await expect(input).toBeFocused()
  await page.keyboard.type('planning')
  await expect(input).toHaveText('planning')
  await input.press('ControlOrMeta+Z')
  await expect(input).not.toHaveText('planning')
  await input.press('ControlOrMeta+Shift+Z')
  await expect(input).toHaveText('planning')
  await input.press('Escape')
  await expect(input).toHaveText('产品规划')
  await input.press('F2')
  await page.keyboard.type('replacement')
  await expect(input).toHaveText('replacement')
  await input.press('Escape')
  await expect(input).toHaveText('产品规划')
  await input.press('F2')
  await composeChinese(page, input, '中文主题')
  await input.press('Shift+Enter')
  await page.keyboard.insertText('第二行也能继续输入')
  await expect(input).toContainText('第二行也能继续输入')
  const count = await page.locator('.react-flow__node').count()
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await expect(input).toContainText('中文主题')
  await dockAction(page, '撤销')
  await expect(page.getByTestId('topic-root')).toContainText('产品规划')
  await dockAction(page, '重做')
  await expect(page.getByTestId('topic-root')).toContainText('第二行也能继续输入')
  await expect(page.locator('.react-flow__node')).toHaveCount(count)
})

test('右侧同样使用 Lexical，中文草稿在快捷键保存时完整写入', async ({ page }) => {
  await openExample(page)
  await page.getByRole('button', { name: '属性面板', exact: true }).click()
  const input = page.getByRole('textbox', { name: '主题名称', exact: true })
  await input.click()
  await composeChinese(page, input, '从侧栏输入中文')
  const download = await prepareNativeSave(page)
  await input.press('ControlOrMeta+S')
  const path = await download.path()
  if (!path) throw new Error('保存没有生成文件')
  const workbook = decodeTrelyx(await readFile(path))
  expect(workbook.sheets[0]?.document.title).toBe('从侧栏输入中文')
  await expect(page.getByTestId('topic-root')).toContainText('从侧栏输入中文')
})

test('减少动态效果时侧栏立即关闭，快速切换面板与画布保持可用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openExample(page)
  const outline = page.getByRole('button', { name: '文档大纲', exact: true })
  const styles = page.getByRole('button', { name: '属性面板', exact: true })
  await outline.click()
  await styles.click()
  await expect(page.getByRole('complementary', { name: '文档大纲', exact: true })).toBeVisible()
  await page
    .getByRole('tablist', { name: '文档画布', exact: true })
    .getByRole('tab', { name: '用户研究', exact: true })
    .click()
  await page
    .getByRole('tablist', { name: '文档画布', exact: true })
    .getByRole('tab', { name: '产品总览', exact: true })
    .click()
  await outline.click()
  await styles.click()
  await expect(page.locator('.panel-presence')).toHaveCount(0)
  await expect(page.getByRole('tabpanel', { name: '当前画布', exact: true })).toBeVisible()
})
