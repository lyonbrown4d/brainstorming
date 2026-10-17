import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { createDocument } from '@core'
import type { AIAPI, AISettings } from '@shared/ai'
import { AIAssistant } from '@renderer/components/ai/AIAssistant'
import { useEditor } from '@renderer/state/editor'
import '@renderer/styles/ui.css'

const settings: AISettings = {
  baseURL: 'https://fixture.invalid/v1',
  model: 'storybook-fixture',
  hasKey: true,
  keyStorage: 'memory',
  rememberKey: false,
  structuredOutputs: true,
  notice: '此 Story 使用固定测试结果，不发起网络请求。',
}
const api: AIAPI = {
  getAISettings: () => Promise.resolve(settings),
  saveAISettings: () => Promise.resolve(settings),
  generateMindMap: () =>
    Promise.resolve({
      tree: {
        title: 'AI 测试建议',
        children: [
          { title: '研究用户需求', children: [] },
          { title: '验证方案', children: [] },
        ],
      },
      topicCount: 3,
      inputTokens: 20,
      outputTokens: 40,
    }),
  cancelAIGeneration: () => Promise.resolve(),
}
const meta = {
  title: 'Trelyx/AI 助手',
  component: AIAssistant,
  parameters: { layout: 'centered' },
  args: {
    api,
    onAddSheet: (document) => useEditor.getState().addDocumentSheet(document),
    defaultOpen: true,
  },
  beforeEach: () => {
    useEditor.getState().replace(createDocument('原导图', 'ai-story'))
  },
} satisfies Meta<typeof AIAssistant>
export default meta
type Story = StoryObj<typeof meta>
const generate = async (canvasElement: HTMLElement) => {
  const page = within(canvasElement.ownerDocument.body)
  const dialog = within(await page.findByRole('dialog', { name: 'AI 思维导图助手' }))
  await waitFor(() => expect(dialog.getByText(/storybook-fixture/)).toBeVisible())
  await userEvent.type(dialog.getByRole('textbox', { name: '你的要求' }), '整理发布准备工作')
  await userEvent.click(dialog.getByRole('button', { name: '发送并生成' }))
  await expect(await dialog.findByRole('region', { name: '生成结果' })).toBeVisible()
  return dialog
}
export const PreviewAndApply: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await generate(canvasElement)
    await expect(useEditor.getState().workbook.sheets).toHaveLength(1)
    await userEvent.click(dialog.getByRole('button', { name: '确认添加新画布' }))
    await expect(useEditor.getState().workbook.sheets).toHaveLength(2)
    await expect(useEditor.getState().history.document.title).toBe('AI 测试建议')
    useEditor.getState().undo()
    await expect(useEditor.getState().workbook.sheets).toHaveLength(1)
    await expect(useEditor.getState().history.document.title).toBe('原导图')
  },
}
export const StalePreview: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await generate(canvasElement)
    useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: '生成后已修改' })
    await userEvent.click(dialog.getByRole('button', { name: '确认添加新画布' }))
    await expect(dialog.getByRole('alert')).toHaveTextContent('已改变')
    await expect(useEditor.getState().workbook.sheets).toHaveLength(1)
    await expect(useEditor.getState().history.document.title).toBe('生成后已修改')
  },
}
export const BrowserRequiresDesktop: Story = {
  render: () => <AIAssistant defaultOpen onAddSheet={() => false} />,
  beforeEach: () => {
    delete window.trelyx
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(await page.findByRole('status')).toHaveTextContent('需要 Trelyx 桌面版')
    await expect(page.queryByRole('button', { name: '发送并生成' })).not.toBeInTheDocument()
  },
}
