import { openDocumentTabs } from '@tests/e2e/documents'
import { recoveryBytes } from '@tests/electron/native-files'
import { prepareNativeSave, prepareNativeOpen } from '@tests/electron/native-files'
import { reloadWindow } from '@tests/electron/session'
import { expect, test, type Page } from '@tests/electron/fixture'
import { readFile } from 'node:fs/promises'
import { decodeBrainstorming } from '@tests/electron/codec'
import { dockAction } from '@tests/e2e/dock'
import { openExample } from '@tests/e2e/workspace'

const save = async (page: Page) => {
  const download = await prepareNativeSave(page)
  await page.keyboard.press('ControlOrMeta+s')
  const path = await download.path()
  if (!path) throw new Error('保存没有生成文件')
  return await decodeBrainstorming(await readFile(path))
}
const recoveryContents = async (page: Page) => recoveryBytes(page)

test('启动首页不加载或自动保存示例，模板与指定结构创建独立文档', async ({ page }, testInfo) => {
  await reloadWindow(page)
  await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeEnabled()
  await expect(page.getByTestId('topic-root')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '文件菜单', exact: true })).toHaveCount(0)
  // Wait beyond the real 700 ms recovery debounce to detect an unwanted startup write.
  await page.waitForTimeout(1000)
  expect(await recoveryContents(page)).toBeNull()
  await expect(page.getByRole('button', { name: /^选择/ })).toHaveCount(15)
  await expect(page.getByRole('button', { name: '空白导图', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '创建文档', exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('brainstorming-home.png') })
  const structure = page.getByRole('button', { name: '选择向右括号图', exact: true })
  await structure.focus()
  await page.keyboard.press('Enter')
  await expect(structure).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('textbox', { name: '文档名称', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('topic-root')).toHaveCount(0)
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.getByRole('button', { name: /^选择.*模板$/ })).toHaveCount(4)
  await expect(page.getByRole('button', { name: '空白导图', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '选择项目计划模板', exact: true }).click()
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('发布准备')
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await expect(page.getByRole('button', { name: '选择向右括号图', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '文档名称', exact: true })).toHaveValue('发布准备')
  await expect(page.getByRole('button', { name: '选择项目计划模板', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.screenshot({ path: testInfo.outputPath('brainstorming-creation-guide.png') })
  await page.getByRole('button', { name: '创建文档', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText('发布准备')
  await expect(
    page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab'),
  ).toHaveCount(1)
  await expect(page.locator('.status-bar')).toContainText('13 个主题')
  const workbook = await save(page)
  expect(workbook.sheets[0]?.document.settings?.layout).toBe('brace-right')
  expect(
    Object.values(workbook.sheets[0]?.document.topics ?? {}).map((topic) => topic.title),
  ).toContain('关键里程碑')
})

test('新建画布保留原文档内容，独立结构和种子内容可以整次撤销', async ({ page }) => {
  await reloadWindow(page)
  await page.getByRole('button', { name: '选择向下树形图', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('产品设计')
  await page.getByRole('button', { name: '选择头脑风暴模板', exact: true }).click()
  await page.getByRole('button', { name: '创建文档', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText('产品设计')
  const before = await save(page)
  await page.getByRole('button', { name: '新建画布', exact: true }).click()
  await expect(page.getByRole('heading', { name: '新建画布', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '选择垂直时间线', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('textbox', { name: '画布名称', exact: true }).fill('交付排期')
  await page.getByRole('button', { name: '创建画布', exact: true }).click()
  await expect(
    page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab'),
  ).toHaveCount(2)
  await expect(page.getByTestId('topic-root')).toContainText('交付排期')
  await expect(page.locator('.status-bar')).toContainText('1 个主题')
  await dockAction(page, '撤销')
  await expect(
    page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab'),
  ).toHaveCount(1)
  await expect(page.getByTestId('topic-root')).toContainText('产品设计')
  await dockAction(page, '重做')
  await expect(
    page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab'),
  ).toHaveCount(2)
  const after = await save(page)
  expect(after.id).toBe(before.id)
  expect(after.sheets[0]).toEqual(before.sheets[0])
  expect(after.sheets[1]?.document.settings?.layout).toBe('timeline-vertical')
  expect(after.sheets[1]?.document.title).toBe('交付排期')
})

test('打开引导页和返回首页保留未保存编辑，新建导图标签保留原画布', async ({ page }) => {
  await openExample(page)
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  await page.getByTestId('topic-root').dblclick()
  await page.getByRole('textbox', { name: '编辑主题标题', exact: true }).fill('保留未保存的内容')
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('ControlOrMeta+n')
  await expect(page.getByRole('heading', { name: '新建文档', exact: true })).toBeVisible()
  expect(dialogs).toHaveLength(0)
  await page.getByRole('button', { name: '返回画布', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText('保留未保存的内容')
  await page.getByRole('button', { name: '返回首页', exact: true }).click()
  await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeVisible()
  expect(dialogs).toHaveLength(0)
  await page.getByRole('button', { name: '返回画布', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText('保留未保存的内容')
  await page.keyboard.press('ControlOrMeta+n')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('不应替换的文档')
  await page.getByRole('button', { name: '创建文档', exact: true }).click()
  expect(dialogs).toHaveLength(0)
  await expect(page.getByTestId('topic-root')).toContainText('不应替换的文档')
  const documents = await openDocumentTabs(page)
  await expect(documents.getByRole('tab')).toHaveCount(2)
  await documents.getByRole('tab').first().click()
  await expect(page.getByTestId('topic-root')).toContainText('保留未保存的内容')
  await expect(page.locator('.save-status')).toContainText('未保存')
})

test('首页打开损坏文件或取消选择仍保留首页', async ({ page }) => {
  await reloadWindow(page)
  const open = page.getByRole('button', { name: '打开本地文件', exact: true })
  const invalid = await prepareNativeOpen(page)
  await open.click()
  await invalid.selectFile({
    name: '损坏.brainstorming',
    mimeType: 'application/zip',
    buffer: Buffer.from('broken'),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByTestId('topic-root')).toHaveCount(0)
  await expect(open).toBeEnabled()
  const cancel = await prepareNativeOpen(page)
  await open.click()
  await cancel.selectFile([])
  await expect(open).toBeEnabled()
  await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeVisible()
  await expect(page.getByTestId('topic-root')).toHaveCount(0)
})

test('创建名称支持中文组词，候选确认不会提前创建文档', async ({ page }) => {
  await reloadWindow(page)
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  const name = page.getByRole('textbox', { name: '文档名称', exact: true })
  await name.focus()
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Input.imeSetComposition', {
      text: 'chanpin',
      selectionStart: 7,
      selectionEnd: 7,
    })
    await expect(name).toHaveValue('chanpin')
    const prevented = await name.evaluate(
      (element) =>
        !element.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            isComposing: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
    )
    expect(prevented).toBe(true)
    await expect(page.getByTestId('topic-root')).toHaveCount(0)
    await session.send('Input.insertText', { text: '产品设计' })
    await expect(name).toHaveValue('产品设计')
  } finally {
    await session.detach()
  }
  await page.getByRole('button', { name: '创建文档', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText('产品设计')
})
