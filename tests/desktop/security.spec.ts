import { mainWindow } from './windows'
import { enterExampleIfHome } from '../e2e/workspace'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decryptTrelyx, isEncryptedTrelyx } from '../../src/formats/encrypted'
import { openDock } from '../e2e/dock'

const password = 'desktop-security-test'
async function fileAction(page: Page, name: string): Promise<void> {
  if (
    name === '打开导图' &&
    (await page.getByRole('button', { name: '打开本地文件', exact: true }).isVisible())
  ) {
    await page.getByRole('button', { name: '打开本地文件', exact: true }).click()
    return
  }
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}
async function editTitle(page: Page, text: string): Promise<void> {
  await page.getByTestId('topic-root').dblclick()
  await page.getByTestId('topic-root').locator('[contenteditable="true"]').fill(text)
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await expect(page.getByTestId('topic-root')).toContainText(text)
}
async function diskTitle(path: string): Promise<string> {
  try {
    return (await decryptTrelyx(await readFile(path), password)).sheets[0]?.document.title ?? ''
  } catch {
    return ''
  }
}
async function stop(app: ElectronApplication): Promise<void> {
  const exited = new Promise<void>((resolve) => {
    app.process().once('exit', () => {
      resolve()
    })
  })
  app.process().kill('SIGKILL')
  await exited
}
async function unlock(page: Page, title: string, wrong = false): Promise<void> {
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  await expect(dialog).toBeVisible()
  if (wrong) {
    await dialog.getByLabel('密码', { exact: true }).fill('wrong-password')
    await dialog.getByRole('button', { name: '解锁', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('密码错误')
  }
  await dialog.getByLabel('密码', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: '解锁', exact: true }).click()
  await expect(dialog).toBeHidden()
}

test('真实 Electron 密码文件、加密历史、重启解锁与恢复记录形成闭环', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trelyx-security-desktop-'))
  const profile = join(directory, 'profile')
  const savedPath = join(directory, 'protected.trelyx')
  const recoveryPath = join(profile, 'recovery-v1.trelyx')
  let app: ElectronApplication | null = null
  try {
    app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`] })
    let page = await mainWindow(app)
    await enterExampleIfHome(page)
    page.on('dialog', (dialog) => {
      void dialog.accept()
    })
    await expect(page.getByTestId('topic-root')).toBeVisible()
    await editTitle(page, '第一份机密内容')
    await openDock(page)
    await page.getByRole('button', { name: '文件密码', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '文件密码', exact: true })
    await settings.getByLabel('密码', { exact: true }).fill(password)
    await settings.getByLabel('确认密码', { exact: true }).fill(password)
    await settings.getByRole('button', { name: '启用密码', exact: true }).click()
    await expect(settings).toBeHidden()
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path })
    }, savedPath)
    await fileAction(page, '保存导图')
    await expect.poll(() => diskTitle(savedPath)).toBe('第一份机密内容')
    expect(await isEncryptedTrelyx(await readFile(savedPath))).toBe(true)
    await expect.poll(() => diskTitle(recoveryPath)).toBe('第一份机密内容')
    expect((await readFile(recoveryPath)).includes(Buffer.from(password))).toBe(false)
    await editTitle(page, '第二份机密内容')
    await fileAction(page, '保存导图')
    await expect.poll(() => diskTitle(savedPath)).toBe('第二份机密内容')
    await openDock(page)
    await page.getByRole('button', { name: '版本历史', exact: true }).click()
    const history = page.getByRole('dialog', { name: '版本历史', exact: true })
    await expect(history.getByRole('button', { name: '恢复', exact: true })).toHaveCount(2)
    await history.getByRole('button', { name: '恢复', exact: true }).last().click()
    await unlock(page, '解锁思维导图')
    await expect(page.getByTestId('topic-root')).toContainText('第一份机密内容')
    expect(await diskTitle(savedPath)).toBe('第二份机密内容')
    await expect(page.locator('.save-status')).toContainText('未保存')
    await expect.poll(() => diskTitle(recoveryPath)).toBe('第一份机密内容')
    await stop(app)
    app = null

    // A new profile proves no key is recovered from persisted settings or prior process memory.
    app = await electron.launch({
      args: ['.', `--user-data-dir=${join(directory, 'new-profile')}`, savedPath],
    })
    page = await mainWindow(app)
    const prompt = page.getByRole('dialog', { name: '解锁思维导图', exact: true })
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByTestId('topic-root')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '打开本地文件', exact: true })).toBeVisible()
    expect(await diskTitle(savedPath)).toBe('第二份机密内容')
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] })
    }, savedPath)
    await fileAction(page, '打开导图')
    await unlock(page, '解锁思维导图', true)
    await expect(page.getByTestId('topic-root')).toContainText('第二份机密内容')
    const capabilities = await page.evaluate(() => ({
      node: 'require' in window,
      unlock: typeof window.trelyx?.unlockDocument,
    }))
    expect(capabilities).toEqual({ node: false, unlock: 'function' })
    await stop(app)
    app = null

    app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`] })
    page = await mainWindow(app)
    page.on('dialog', (dialog) => {
      void dialog.accept()
    })
    await unlock(page, '解锁自动恢复记录', true)
    await expect(page.getByRole('button', { name: '恢复导图', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '恢复导图', exact: true }).click()
    await expect(page.getByTestId('topic-root')).toContainText('第一份机密内容')
    expect(await isEncryptedTrelyx(await readFile(recoveryPath))).toBe(true)
    expect(await diskTitle(savedPath)).toBe('第二份机密内容')
  } finally {
    if (app) await stop(app)
    await rm(directory, { recursive: true, force: true })
  }
})
