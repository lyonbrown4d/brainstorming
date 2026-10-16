import { enterExampleIfHome } from '../e2e/workspace'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dockAction, openDock } from '../e2e/dock'

// Local deterministic provider fixture: no external account, API key or internet request.
test('真实 Electron AI 配置、预览、添加与一次撤销闭环', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trelyx-ai-desktop-'))
  const requests: { path: string; authorization: string | undefined; body: string }[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 128 * 1024) {
        response.writeHead(413)
        response.end()
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('error', () => {
      response.destroy()
    })
    request.on('end', () => {
      requests.push({
        path: request.url ?? '',
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString('utf8'),
      })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          id: 'desktop-offline-test',
          object: 'chat.completion',
          created: 1,
          model: 'local-fixture',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  title: 'AI 桌面测试结果',
                  children: [
                    { title: '第一项建议', children: [] },
                    { title: '第二项建议', children: [] },
                  ],
                }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 15, completion_tokens: 30, total_tokens: 45 },
        }),
      )
    })
  })
  let app: ElectronApplication | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('本地 AI fixture 端口不可用')
    app = await electron.launch({ args: ['.', `--user-data-dir=${directory}`] })
    const page = await app.firstWindow()
    await enterExampleIfHome(page)
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    await expect(page.getByTestId('topic-root')).toBeVisible()
    await page.getByTestId('topic-root').dblclick()
    await page
      .getByRole('textbox', { name: '编辑主题标题' })
      .fill('文档私有标题 offline-private-context')
    await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
    await expect(page.getByTestId('topic-root')).toContainText('offline-private-context')
    const originalTitle = await page.getByTestId('topic-root').textContent()
    const sheetTabs = page.getByRole('tablist', { name: '文档画布' }).getByRole('tab')
    const originalSheetCount = await sheetTabs.count()
    await openDock(page)
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'AI 思维导图助手' })
    await dialog.getByRole('button', { name: '服务设置', exact: true }).click()
    await dialog
      .getByRole('textbox', { name: 'OpenAI 兼容服务地址' })
      .fill(`http://127.0.0.1:${address.port}/v1`)
    await dialog.getByRole('textbox', { name: '模型名称' }).fill('local-fixture')
    await dialog.getByRole('button', { name: '保存服务设置' }).click()
    await expect(dialog.getByText(/local-fixture/)).toBeVisible()
    expect(requests).toHaveLength(0)
    await dialog.getByRole('textbox', { name: '你的要求' }).fill('仅用于离线测试：整理发布准备工作')
    await dialog.getByRole('button', { name: '发送并生成' }).click()
    const preview = dialog.getByRole('region', { name: '生成结果' })
    await expect(preview).toContainText('AI 桌面测试结果')
    await expect(preview).toContainText('第一项建议')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.path).toBe('/v1/chat/completions')
    expect(requests[0]?.authorization).toBeUndefined()
    expect(requests[0]?.body).not.toContain('offline-private-context')
    await dialog.getByRole('button', { name: '确认添加新画布' }).click()
    await expect(dialog).toBeHidden()
    await expect(sheetTabs).toHaveCount(originalSheetCount + 1)
    await expect(sheetTabs.filter({ hasText: 'AI 桌面测试结果' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByTestId('topic-root')).toContainText('AI 桌面测试结果')
    await dockAction(page, '撤销')
    await expect(sheetTabs).toHaveCount(originalSheetCount)
    await expect(page.getByTestId('topic-root')).toHaveText(originalTitle ?? '')
    const settings = await readFile(join(directory, 'ai-settings.json'), 'utf8')
    expect(settings).not.toContain('apiKey')
    expect(settings).not.toContain('encryptedKey')
    expect(errors).toEqual([])
  } finally {
    app?.process().kill('SIGKILL')
    server.closeAllConnections()
    if (server.listening)
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
    await rm(directory, { recursive: true, force: true })
  }
})
