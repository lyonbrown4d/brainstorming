import { openDocumentTabs } from '@tests/e2e/documents'
import { recoveryBytes } from '@tests/electron/native-files'
import { prepareNativeSave, prepareNativeOpen } from '@tests/electron/native-files'
import { reloadWindow } from '@tests/electron/session'
import { completeDocumentCreation, openExample } from '@tests/e2e/workspace'
import { expect, test, type Page } from '@tests/electron/fixture'
import { readFile } from 'node:fs/promises'
import { isEncryptedBrainstorming, decryptBrainstorming } from '@tests/electron/codec'
import { openDock } from '@tests/e2e/dock'

const password = 'native-test-password'
const fileAction = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
  if (name === '新建导图') await completeDocumentCreation(page)
}
const openFile = async (page: Page, path: string): Promise<void> => {
  const chooser = await prepareNativeOpen(page)
  await fileAction(page, '打开导图')
  await chooser.selectFile(path)
}
const recoveryEncrypted = async (page: Page): Promise<boolean> => {
  const bytes = await recoveryBytes(page)
  return bytes ? isEncryptedBrainstorming(bytes) : false
}

test('密码保护从 Dock 弹出后保持可用，保存/恢复加密，并支持取消和错密码后重新打开', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept())
  await openExample(page)
  await page.getByTestId('topic-root').dblclick()
  const title = page.getByTestId('topic-root').locator('[contenteditable="true"]')
  await title.fill('保密导图')
  await page.locator('.react-flow__pane').click({ position: { x: 30, y: 30 } })
  await expect(page.getByTestId('topic-root')).toContainText('保密导图')
  await openDock(page)
  await page.getByRole('button', { name: '文件密码', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '文件密码' })
  await expect(settings).toBeVisible()
  await settings.getByLabel('密码', { exact: true }).fill(password)
  await settings.getByLabel('确认密码', { exact: true }).fill(password)
  await settings.getByRole('button', { name: '启用密码', exact: true }).click()
  await expect(settings).toBeHidden()
  const saving = await prepareNativeSave(page)
  await page.keyboard.press('ControlOrMeta+S')
  const path = await saving.path()
  if (!path) throw new Error('Missing encrypted native file')
  const bytes = await readFile(path)
  expect(await isEncryptedBrainstorming(bytes)).toBe(true)
  expect((await decryptBrainstorming(bytes, password)).sheets[0]?.document.title).toBe('保密导图')
  await expect.poll(() => recoveryEncrypted(page)).toBe(true)
  await fileAction(page, '新建导图')
  await expect(page.getByTestId('topic-root')).toContainText('新的想法')
  // Close the saved encrypted tab before testing a fresh unlock; duplicate opens reuse it.
  await (
    await openDocumentTabs(page)
  )
    .getByRole('button', { name: /^关闭导图 / })
    .first()
    .click()
  await openFile(page, path)
  const unlock = page.getByRole('dialog', { name: '解锁思维导图' })
  await expect(unlock).toBeVisible()
  await unlock.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText('新的想法')
  await openFile(page, path)
  await unlock.getByLabel('密码', { exact: true }).fill('wrong-password')
  await unlock.getByRole('button', { name: '解锁', exact: true }).click()
  await expect(unlock.getByRole('alert')).toContainText('密码错误')
  await unlock.getByLabel('密码', { exact: true }).fill(password)
  await unlock.getByRole('button', { name: '解锁', exact: true }).click()
  await expect(unlock).toBeHidden()
  await expect(page.getByTestId('topic-root')).toContainText('保密导图')
  await (
    await openDocumentTabs(page)
  )
    .getByRole('button', { name: /^关闭导图 / })
    .first()
    .click()
  await expect.poll(() => recoveryEncrypted(page)).toBe(true)
  await reloadWindow(page)
  await page.getByRole('button', { name: '恢复上次打开的 1 份导图', exact: true }).click()
  const recovery = page.getByRole('dialog', { name: '解锁自动恢复记录' })
  await expect(recovery).toBeVisible()
  await recovery.getByRole('button', { name: '取消', exact: true }).click()
  await expect.poll(() => recoveryEncrypted(page)).toBe(true)
  await expect(page.getByTestId('topic-root')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeVisible()
})
