import { openDocumentTabs } from '@tests/e2e/documents'
import { nativeRecoveryContents } from '@tests/electron/recovery'
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDocument, createWorkbook, type MindMapWorkbook } from '@core'
import { decodeBrainstorming, encodeBrainstorming } from '@formats/brainstorming'
import { mainWindow } from '@tests/desktop/windows'
import { seedChinese } from '@tests/electron/preferences'

const documentTabs = openDocumentTabs
const sheets = (page: Page) => page.getByRole('tablist', { name: '文档画布', exact: true })
const title = (page: Page) => page.getByTestId('topic-root')
const editTitle = async (page: Page, value: string): Promise<void> => {
  await title(page).dblclick()
  await page.getByRole('textbox', { name: '编辑主题标题', exact: true }).fill(value)
  await page.keyboard.press('Enter')
  await expect(title(page)).toContainText(value)
}
const openPath = async (app: ElectronApplication, page: Page, path: string): Promise<void> => {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [filePath] })
  }, path)
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '打开导图', exact: true }).click()
}
const diskWorkbook = async (path: string): Promise<MindMapWorkbook> =>
  decodeBrainstorming(await readFile(path))

const fixtures = async (directory: string) => {
  const first = createWorkbook(createDocument('甲内容', 'document-a'), '导图甲')
  const workbook = {
    ...first,
    sheets: [
      ...first.sheets,
      { id: 'sheet-a2', name: '甲第二页', document: createDocument('甲第二页', 'document-a2') },
    ],
  }
  const firstPath = join(directory, 'alpha.brainstorming')
  const secondPath = join(directory, 'beta.brainstorming')
  await Promise.all([
    writeFile(firstPath, encodeBrainstorming(workbook)),
    writeFile(
      secondPath,
      encodeBrainstorming(createWorkbook(createDocument('乙内容', 'document-b'), '导图乙')),
    ),
  ])
  return { firstPath, secondPath }
}

test('两份原生文件保留独立 Sheet、撤销与保存路径，同路径复用，关闭只影响目标导图', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-document-tabs-'))
  await seedChinese(directory)
  const { firstPath, secondPath } = await fixtures(directory)
  const app = await _electron.launch({
    colorScheme: null,
    args: ['.', `--user-data-dir=${directory}`, firstPath],
  })
  try {
    const page = await mainWindow(app)
    await expect(title(page)).toContainText('甲内容')
    await expect(sheets(page).getByRole('tab')).toHaveCount(2)
    await editTitle(page, '甲修改')
    await sheets(page).getByRole('tab', { name: '甲第二页', exact: true }).click()
    await editTitle(page, '甲第二页修改')
    await sheets(page).getByRole('tab').first().click()
    await openPath(app, page, secondPath)
    await expect(title(page)).toContainText('乙内容')
    await expect((await documentTabs(page)).getByRole('tab')).toHaveCount(2)
    await expect(sheets(page).getByRole('tab')).toHaveCount(1)
    await editTitle(page, '乙修改')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(title(page)).toContainText('乙内容')
    await (await documentTabs(page)).getByRole('tab').first().click()
    await expect(title(page)).toContainText('甲修改')
    await expect(sheets(page).getByRole('tab')).toHaveCount(2)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(title(page)).toContainText('甲内容')
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(title(page)).toContainText('甲修改')
    await sheets(page).getByRole('tab', { name: '甲第二页', exact: true }).click()
    await expect(title(page)).toContainText('甲第二页修改')
    await sheets(page).getByRole('tab').first().click()
    // Existing-file saves must never fall through to a save-as dialog.
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: true, filePath: '' })
    })
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(async () => (await diskWorkbook(firstPath)).sheets[0]?.document.title)
      .toBe('甲修改')
    expect((await diskWorkbook(firstPath)).sheets[1]?.document.title).toBe('甲第二页修改')
    expect((await diskWorkbook(secondPath)).sheets[0]?.document.title).toBe('乙内容')
    await openPath(app, page, secondPath)
    await expect((await documentTabs(page)).getByRole('tab')).toHaveCount(2)
    await expect(title(page)).toContainText('乙内容')
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(title(page)).toContainText('乙修改')
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(async () => (await diskWorkbook(secondPath)).sheets[0]?.document.title)
      .toBe('乙修改')
    expect((await diskWorkbook(firstPath)).sheets[0]?.document.title).toBe('甲修改')
    const copyPath = join(directory, 'alpha-copy.brainstorming')
    await writeFile(copyPath, await readFile(firstPath))
    await openPath(app, page, copyPath)
    await expect((await documentTabs(page)).getByRole('tab')).toHaveCount(2)
    await expect(title(page)).toContainText('甲修改')
    await expect(page.locator('.save-status')).toHaveAttribute('title', firstPath)
    await editTitle(page, '关闭时保留甲草稿')
    const close = (await documentTabs(page)).getByRole('button', { name: /^关闭导图 / }).first()
    const prompts: string[] = []
    page.once('dialog', (dialog) => {
      prompts.push(dialog.message())
      void dialog.dismiss()
    })
    await close.click()
    await expect((await documentTabs(page)).getByRole('tab')).toHaveCount(2)
    await expect(title(page)).toContainText('关闭时保留甲草稿')
    expect(prompts).toHaveLength(1)
    page.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await close.click()
    await expect((await documentTabs(page)).getByRole('tab')).toHaveCount(1)
    await expect(title(page)).toContainText('乙修改')
    expect((await diskWorkbook(firstPath)).sheets[0]?.document.title).toBe('甲修改')
    await (await documentTabs(page)).getByRole('button', { name: /^关闭导图 / }).click()
    await expect(page.getByRole('button', { name: '打开本地文件', exact: true })).toBeVisible()
    await expect(page.getByTestId('topic-root')).toHaveCount(0)
  } finally {
    app.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})

test('重启后显式恢复上次打开的两份导图，各自内容与 Sheet 保留且不覆盖原文件', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-document-recovery-'))
  await seedChinese(directory)
  const { firstPath, secondPath } = await fixtures(directory)
  let app = await _electron.launch({
    colorScheme: null,
    args: ['.', `--user-data-dir=${directory}`, firstPath],
  })
  try {
    let page = await mainWindow(app)
    await expect(title(page)).toContainText('甲内容')
    await editTitle(page, '甲恢复草稿')
    await openPath(app, page, secondPath)
    await expect(title(page)).toContainText('乙内容')
    await editTitle(page, '乙恢复草稿')
    await expect.poll(() => nativeRecoveryContents(directory)).toContain('甲恢复草稿')
    await expect.poll(() => nativeRecoveryContents(directory)).toContain('乙恢复草稿')
    const stopped = app.waitForEvent('close')
    app.process().kill('SIGKILL')
    await stopped
    app = await _electron.launch({ colorScheme: null, args: ['.', `--user-data-dir=${directory}`] })
    page = await mainWindow(app)
    await expect(title(page)).toHaveCount(0)
    await page.getByRole('button', { name: '恢复上次打开的 2 份导图', exact: true }).click()
    await expect((await documentTabs(page)).getByRole('tab')).toHaveCount(2)
    await (await documentTabs(page)).getByRole('tab').first().click()
    await expect(title(page)).toContainText('甲恢复草稿')
    await expect(sheets(page).getByRole('tab')).toHaveCount(2)
    await sheets(page).getByRole('tab', { name: '甲第二页', exact: true }).click()
    await expect(title(page)).toContainText('甲第二页')
    await (await documentTabs(page)).getByRole('tab').last().click()
    await expect(title(page)).toContainText('乙恢复草稿')
    await expect(sheets(page).getByRole('tab')).toHaveCount(1)
    expect((await diskWorkbook(firstPath)).sheets[0]?.document.title).toBe('甲内容')
    expect((await diskWorkbook(secondPath)).sheets[0]?.document.title).toBe('乙内容')
  } finally {
    app.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})
