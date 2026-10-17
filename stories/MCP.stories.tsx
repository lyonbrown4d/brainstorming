import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { createDocument } from '@core'
import type { MCPAPI, MCPConnection } from '@shared/mcp'
import { inactiveMCP } from '@tests/fixtures/mcp'
import { MCPDialog } from '@renderer/components/mcp/MCPDialog'
import { handleMCPRequest, useMCPProposals } from '@renderer/components/mcp/workspace'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { queryClient } from '@renderer/lib/queryClient'
import '@renderer/styles/ui.css'

const connectionFor = (): MCPConnection => ({
  workbookId: useEditor.getState().workbook.id,
  sessionId: 'storybook-session',
  endpoint: 'http://127.0.0.1:12345/mcp',
  token: 'storybook-example-not-a-real-token',
  includeNotes: false,
  allowProposals: true,
})
const api: MCPAPI = {
  ...inactiveMCP,
  getMCPConnection: () => Promise.resolve(connectionFor()),
  startMCPServer: (grant) => Promise.resolve({ ...connectionFor(), ...grant }),
}
const meta = {
  title: 'Trelyx/MCP 连接',
  component: MCPDialog,
  args: { api, defaultOpen: true },
  beforeEach: () => {
    queryClient.removeQueries({ queryKey: ['mcp'] })
    useEditor.getState().replace(createDocument('共享示例', 'mcp-story'))
    useEditor.setState({ busy: false })
    usePresentation.setState({ playing: false })
    useMCPProposals.setState({ proposals: [] })
  },
} satisfies Meta<typeof MCPDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Connected: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = within(await page.findByRole('dialog', { name: 'MCP 连接' }))
    await expect(await dialog.findByText(/MCP 已启用/)).toBeVisible()
    await expect(dialog.queryByRole('textbox', { name: '客户端连接配置' })).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: '显示连接配置' }))
    await expect(dialog.getByRole('textbox', { name: '客户端连接配置' })).toHaveTextContent(
      'Bearer storybook-example',
    )
    await userEvent.click(dialog.getByRole('button', { name: '停止 MCP 服务' }))
    await expect(await dialog.findByRole('button', { name: '启用本机 MCP 服务' })).toBeVisible()
  },
}
export const ReviewAndApply: Story = {
  beforeEach: () => {
    const state = useEditor.getState()
    const grant = connectionFor()
    const base = { id: 'story-request', sessionId: grant.sessionId, grant }
    const workbook = handleMCPRequest({ ...base, action: { type: 'workbook' } })
    const sheet = (workbook.sheets as { revision: string }[])[0]
    if (!sheet) throw new Error('Story sheet is missing')
    handleMCPRequest({
      ...base,
      action: {
        type: 'propose',
        input: {
          sheetId: state.activeSheetId,
          revision: sheet.revision,
          summary: '新增发布准备分支',
          operations: [
            { type: 'addTopic', parentId: 'root', id: 'mcp-story-added', title: '准备发布' },
            {
              type: 'addTopic',
              parentId: 'mcp-story-added',
              id: 'mcp-story-child',
              title: '验证安装包',
            },
          ],
        },
      },
    })
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = within(await page.findByRole('dialog', { name: 'MCP 连接' }))
    await expect(await dialog.findByText(/MCP 已启用/)).toBeVisible()
    await expect(dialog.getByRole('article', { name: 'MCP 编辑草稿' })).toHaveTextContent(
      '新增发布准备分支',
    )
    await expect(useEditor.getState().history.document.topics['mcp-story-added']).toBeUndefined()
    await userEvent.click(dialog.getByRole('button', { name: '确认应用草稿' }))
    await expect(dialog.getByText('已应用草稿，可一次撤销。')).toBeVisible()
    await expect(useEditor.getState().history.document.topics['mcp-story-child']?.title).toBe(
      '验证安装包',
    )
    useEditor.getState().undo()
    await expect(useEditor.getState().history.document.topics['mcp-story-added']).toBeUndefined()
  },
}
