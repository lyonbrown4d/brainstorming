import { test, expect } from '@tests/electron/fixture'
import { _electron } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { mainWindow } from '@tests/desktop/windows'
import { prepareNativeSave } from '@tests/electron/native-files'
import { seedChinese } from '@tests/electron/preferences'
import { registerSession, resizeWindow } from '@tests/electron/session'
import { topicProperties } from '@tests/e2e/properties'
import {
  assertStoredImageViewer,
  createResourceDocument,
  dropNativeFile,
  fetchResourceBytes,
  selectResourceFile,
} from '@tests/desktop/resources-helpers'

test('真实图片导入、瓦片预览、资源 Range 和原生拖放保存后可在新进程重新打开', async ({
  page,
  electronApp,
  profileDirectory,
}) => {
  await createResourceDocument(page)
  const input = join(profileDirectory, 'stored-image.png')
  await sharp({ create: { width: 2400, height: 1300, channels: 4, background: '#52a8decc' } })
    .png()
    .toFile(input)
  const original = await readFile(input)
  const objectId = createHash('sha256').update(original).digest('hex')
  const panel = await topicProperties(page)
  await selectResourceFile(electronApp, input)
  await panel.getByRole('button', { name: '添加图片', exact: true }).click()
  await assertStoredImageViewer(page, 'stored-image.png')
  const origin = await page.evaluate(() => window.brainstorming?.resourceOrigin)
  if (!origin) throw new Error('Resource origin is unavailable')
  const response = await fetchResourceBytes(page, `${origin}/object/${objectId}`, 'bytes=0-15')
  expect(response).toEqual({
    status: 206,
    contentType: 'image/png',
    contentRange: `bytes 0-15/${original.length}`,
    bytes: [...original.subarray(0, 16)],
  })
  expect(
    (await fetchResourceBytes(page, `${origin}/object/${objectId}`, `bytes=${original.length}-`))
      .status,
  ).toBe(416)
  const attachment = join(profileDirectory, 'dropped-payload.bin')
  await writeFile(attachment, new Uint8Array([1, 3, 5, 7, 9]))
  await dropNativeFile(page, attachment)
  await expect(panel.getByText('dropped-payload.bin', { exact: true })).toBeVisible()
  const saved = await prepareNativeSave(page)
  await page.keyboard.press('ControlOrMeta+s')
  const path = await saved.path()
  await expect(page.locator('.save-status')).toContainText('已保存')
  await rm(input)
  await rm(attachment)
  await electronApp.close()

  const reopenedDirectory = await mkdtemp(join(tmpdir(), 'brainstorming-resource-reopen-'))
  let reopened: Awaited<ReturnType<typeof _electron.launch>> | undefined
  try {
    await seedChinese(reopenedDirectory)
    reopened = await _electron.launch({
      args: ['.', `--user-data-dir=${reopenedDirectory}`, path],
      colorScheme: null,
    })
    const reopenedPage = await mainWindow(reopened)
    registerSession(reopenedPage, { app: reopened, directory: reopenedDirectory })
    await resizeWindow(reopenedPage, { width: 1440, height: 960 })
    await expect(reopenedPage.getByTestId('topic-root')).toContainText('资源集成验证')
    await assertStoredImageViewer(reopenedPage, 'stored-image.png')
    const reopenedPanel = await topicProperties(reopenedPage)
    await expect(reopenedPanel.getByText('dropped-payload.bin', { exact: true })).toBeVisible()
    const reopenedOrigin = await reopenedPage.evaluate(() => window.brainstorming?.resourceOrigin)
    if (!reopenedOrigin) throw new Error('Reopened resource origin is unavailable')
    expect(
      (await fetchResourceBytes(reopenedPage, `${reopenedOrigin}/object/${objectId}`, 'bytes=-8'))
        .bytes,
    ).toEqual([...original.subarray(-8)])
    await reopened.close()
    reopened = undefined
  } finally {
    if (reopened) reopened.process().kill('SIGKILL')
    await rm(reopenedDirectory, { recursive: true, force: true })
  }
})

test('公共网页链接自动后台截图并可采用为主题图片', async ({ page, electronApp }) => {
  const url = 'https://example.com/'
  const reachable = await fetch(url, { signal: AbortSignal.timeout(5000) })
    .then((response) => response.ok)
    .catch(() => false)
  test.skip(!reachable, 'Public internet is unavailable for the real webpage capture check')
  await createResourceDocument(page)
  const panel = await topicProperties(page)
  await panel.getByRole('textbox', { name: '链接地址', exact: true }).fill(url)
  await panel.getByRole('button', { name: '保存链接', exact: true }).click()
  // No manual generation call: this proves the document-driven background queue reaches the cache.
  await expect
    .poll(() => page.evaluate((target) => window.brainstorming?.getLinkPreview(target), url), {
      timeout: 30_000,
    })
    .toMatchObject({ mimeType: 'image/png', storage: { width: 1280, height: 720 } })
  await expect(panel.getByRole('img', { name: url, exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '生成网页截图', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('网页截图已添加')
  await expect(panel.getByRole('button', { name: '预览图片', exact: true })).toBeVisible()
  expect(
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(1)
})
