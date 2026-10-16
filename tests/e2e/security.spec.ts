import { completeDocumentCreation, openExample } from './workspace'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { isEncryptedTrelyx, decryptTrelyx } from '../../src/formats/encrypted'
import { openDock } from './dock'

const password = 'browser-test-password'
async function fileAction(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
  if (name === '新建导图') await completeDocumentCreation(page)
}
async function openFile(page: Page, path: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await fileAction(page, '打开导图')
  await (await chooser).setFiles(path)
}
async function recoveryEncrypted(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('trelyx')
        request.onerror = () => {
          reject(new Error('IndexedDB unavailable'))
        }
        request.onsuccess = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('recovery')) {
            db.close()
            resolve(false)
            return
          }
          const transaction = db.transaction('recovery', 'readonly')
          const read = transaction.objectStore('recovery').get('trelyx.recovery.native-v1')
          read.onsuccess = () => {
            const value: unknown = read.result
            db.close()
            resolve(
              typeof value === 'object' &&
                value !== null &&
                'encrypted' in value &&
                value.encrypted === true &&
                'bytes' in value &&
                value.bytes instanceof Uint8Array,
            )
          }
          read.onerror = () => {
            db.close()
            reject(new Error('Recovery read failed'))
          }
        }
      }),
  )
}

test('密码保护从 Dock 弹出后保持可用，下载/恢复加密，并支持取消和错密码后重新打开', async ({
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
  const saving = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+S')
  const path = await (await saving).path()
  if (!path) throw new Error('Missing encrypted download')
  const bytes = await readFile(path)
  expect(await isEncryptedTrelyx(bytes)).toBe(true)
  expect((await decryptTrelyx(bytes, password)).sheets[0]?.document.title).toBe('保密导图')
  await expect.poll(() => recoveryEncrypted(page)).toBe(true)
  await fileAction(page, '新建导图')
  await expect(page.getByTestId('topic-root')).toContainText('新的想法')
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
  await expect.poll(() => recoveryEncrypted(page)).toBe(true)
  await page.reload()
  const recovery = page.getByRole('dialog', { name: '解锁自动恢复记录' })
  await expect(recovery).toBeVisible()
  await recovery.getByRole('button', { name: '取消', exact: true }).click()
  await expect.poll(() => recoveryEncrypted(page)).toBe(true)
  await expect(page.getByTestId('topic-root')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeVisible()
})
