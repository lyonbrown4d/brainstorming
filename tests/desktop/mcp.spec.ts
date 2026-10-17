import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { z } from 'zod'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mainWindow } from '@tests/desktop/windows'
import { enterExampleIfHome } from '@tests/e2e/workspace'
import { dockAction, openDock } from '@tests/e2e/dock'

const dataSchema = z.object({ structuredContent: z.record(z.string(), z.unknown()) })
test('内嵌 MCP：显式授权、真实客户端读取、草稿确认、一次撤销和停止连接', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trelyx-mcp-desktop-'))
  let app: ElectronApplication | undefined
  const client = new Client({ name: 'trelyx-desktop-test', version: '1.0.0' })
  try {
    app = await electron.launch({ args: ['.', `--user-data-dir=${directory}`] })
    const page = await mainWindow(app)
    await enterExampleIfHome(page)
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    const originalTitle = await page.getByTestId('topic-root').textContent()
    expect(await page.evaluate(() => window.trelyx?.getMCPConnection())).toBeNull()
    await openDock(page)
    await page.getByRole('button', { name: 'MCP 连接', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'MCP 连接' })
    await expect(dialog.getByRole('checkbox', { name: '允许读取主题备注' })).not.toBeChecked()
    await dialog.getByRole('checkbox', { name: '允许提交编辑草稿，由我确认后应用' }).check()
    await dialog.getByRole('button', { name: '启用本机 MCP 服务' }).click()
    await expect(dialog.getByText(/MCP 已启用/)).toBeVisible()
    const connection = await page.evaluate(() => window.trelyx?.getMCPConnection())
    if (!connection) throw new Error('MCP did not start')
    await client.connect(
      new StreamableHTTPClientTransport(new URL(connection.endpoint), {
        requestInit: { headers: { Authorization: `Bearer ${connection.token}` } },
      }),
    )
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('propose_edit')
    const workbook = dataSchema.parse(
      await client.callTool({ name: 'get_workbook', arguments: {} }),
    ).structuredContent
    const sheets = z
      .array(z.object({ id: z.string(), rootId: z.string(), revision: z.string() }))
      .parse(workbook.sheets)
    const sheet = sheets.find((entry) => entry.id === workbook.activeSheetId)
    if (!sheet) throw new Error('Shared sheet is missing')
    const branch = dataSchema.parse(
      await client.callTool({
        name: 'read_branch',
        arguments: {
          sheetId: sheet.id,
          limit: 1,
        },
      }),
    ).structuredContent
    expect(JSON.stringify(branch)).not.toContain('"notes"')
    const proposal = dataSchema.parse(
      await client.callTool({
        name: 'propose_edit',
        arguments: {
          sheetId: sheet.id,
          revision: sheet.revision,
          summary: '添加桌面 MCP 验证分支',
          operations: [
            {
              type: 'addTopic',
              parentId: sheet.rootId,
              id: 'desktop-mcp-added',
              title: 'MCP 新分支',
            },
            {
              type: 'addTopic',
              parentId: 'desktop-mcp-added',
              id: 'desktop-mcp-child',
              title: 'MCP 子主题',
            },
          ],
        },
      }),
    ).structuredContent
    expect(proposal.status).toBe('pending')
    await expect(dialog.getByRole('article', { name: 'MCP 编辑草稿' })).toContainText(
      '添加桌面 MCP 验证分支',
    )
    await expect(dialog.getByRole('article', { name: 'MCP 编辑草稿' })).toContainText(
      '在「MCP 新分支」下新增「MCP 子主题」',
    )
    await dialog.screenshot({ path: test.info().outputPath('mcp-proposal.png') })
    await expect(page.getByTestId('topic-desktop-mcp-added')).toHaveCount(0)
    await dialog.getByRole('button', { name: '确认应用草稿' }).click()
    await expect(dialog.getByText('已应用草稿，可一次撤销。')).toBeVisible()
    expect(
      dataSchema.parse(
        await client.callTool({
          name: 'get_edit_status',
          arguments: {
            proposalId: proposal.proposalId,
          },
        }),
      ).structuredContent.status,
    ).toBe('applied')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('topic-desktop-mcp-child')).toContainText('MCP 子主题')
    await dockAction(page, '撤销')
    await expect(page.getByTestId('topic-desktop-mcp-added')).toHaveCount(0)
    await expect(page.getByTestId('topic-root')).toHaveText(originalTitle ?? '')
    await dockAction(page, '重做')
    await expect(page.getByTestId('topic-desktop-mcp-child')).toContainText('MCP 子主题')
    await client.close()
    await openDock(page)
    await page.getByRole('button', { name: 'MCP 连接', exact: true }).click()
    await dialog.getByRole('button', { name: '停止 MCP 服务' }).click()
    await expect(dialog.getByRole('button', { name: '启用本机 MCP 服务' })).toBeVisible()
    expect(await page.evaluate(() => window.trelyx?.getMCPConnection())).toBeNull()
    await expect(fetch(connection.endpoint)).rejects.toThrow()
    expect(errors).toEqual([])
  } finally {
    await client.close()
    app?.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})
