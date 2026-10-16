import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dockAction, moreTools } from '../e2e/dock'

test('原生自定义剪贴板跨画布复制子树，保留普通文本并一次撤销', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trelyx-clipboard-'))
  const app = await electron.launch({ args: ['.', `--user-data-dir=${directory}`] })
  let captured = false
  try {
    // Keep the complete existing clipboard in the test main process; never serialize or log it.
    await app.evaluate(async ({ clipboard, ClipboardItem }) => {
      const snapshot = await Promise.all(
        (await clipboard.read()).map(
          async (item) =>
            new ClipboardItem(
              Object.fromEntries(
                await Promise.all(
                  item.types.map(async (type) => [type, await item.getType(type)] as const),
                ),
              ),
            ),
        ),
      )
      // Verify the fully materialized copy is writable before changing any clipboard content.
      await clipboard.write(snapshot)
      Object.assign(globalThis, { trelyxClipboardSnapshot: snapshot })
    })
    captured = true
    const page = await app.firstWindow()
    await page.getByTestId('topic-vision').click()
    await moreTools(page)
    await page.getByRole('button', { name: '复制主题', exact: true }).click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('产品愿景\n\t让思考自由生长\n\t本地优先')
    const payload = await page.evaluate(() => window.trelyx?.readTopicClipboard())
    expect(payload).toContain('Trelyx topics v1\n')
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: '用户研究', exact: true }).click()
    const before = await page.locator('.topic-count').textContent()
    await moreTools(page)
    await page.getByRole('button', { name: '粘贴主题', exact: true }).click()
    await expect(page.locator('.topic-title').getByText('产品愿景', { exact: true })).toBeVisible()
    await expect(page.locator('.topic-title').getByText('本地优先', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await dockAction(page, '撤销')
    await expect(page.locator('.topic-title').getByText('产品愿景', { exact: true })).toHaveCount(0)
    await expect(page.locator('.topic-count')).toHaveText(before ?? '')
  } finally {
    try {
      if (captured)
        await app.evaluate(async ({ clipboard }) => {
          const snapshot: unknown = Reflect.get(globalThis, 'trelyxClipboardSnapshot')
          if (Array.isArray(snapshot)) await clipboard.write(snapshot as Electron.ClipboardItem[])
          Reflect.deleteProperty(globalThis, 'trelyxClipboardSnapshot')
        })
    } finally {
      app.process().kill('SIGKILL')
      await rm(directory, { recursive: true, force: true })
    }
  }
})
