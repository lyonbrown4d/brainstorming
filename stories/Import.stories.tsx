import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ImportNotice } from '../src/renderer/src/components/ImportNotice'
import { useEditor } from '../src/renderer/src/state/editor'
import '../src/renderer/src/styles/ui.css'
import '../src/renderer/src/styles/chrome.css'

const meta = {
  title: 'Trelyx/XMind 导入',
  component: ImportNotice,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useEditor.setState({
      importReport: {
        sourceName: '产品规划.xmind',
        warnings: ['未导入 XMind 图片（2 项）', 'XMind 布局已转换为 Trelyx 左右布局（1 项）'],
      },
    })
    return () => {
      useEditor.setState({ importReport: null })
    }
  },
} satisfies Meta<typeof ImportNotice>
export default meta
type Story = StoryObj<typeof meta>

export const ConversionReport: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: '查看导入报告' }))
    const dialog = await page.findByRole('dialog', { name: '导入报告' })
    await expect(within(dialog).getByText('未导入 XMind 图片（2 项）')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: '关闭导入提示' }))
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
  },
}
