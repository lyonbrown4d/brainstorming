import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { createExampleDocument } from '../src/core'
import { App } from '../src/renderer/src/App'
import { useEditor } from '../src/renderer/src/state/editor'
import { setSelectedTopics } from '../src/renderer/src/state/selection'
import { useSearch } from '../src/renderer/src/state/search'
import { clearBrowserRecovery } from '../src/renderer/src/state/recovery'

const meta = {
  title: 'Trelyx/批量编辑与查找',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: async () => {
    await clearBrowserRecovery()
    useEditor.getState().replace(createExampleDocument())
    useEditor.setState({ recovery: null, outlineOpen: false, inspectorOpen: false })
    useSearch.setState({
      open: false,
      query: '',
      replacement: '',
      matchCase: false,
      wholeWord: false,
      includeNotes: true,
      allSheets: false,
    })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const MultipleSelection: Story = {
  beforeEach: () => {
    setSelectedTopics(['vision', 'experience'])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    const page = within(canvasElement.ownerDocument.body)
    const tools = within(await page.findByRole('group', { name: '多选主题操作' }))
    await waitFor(() => expect(tools.getByText('已选择 2 个主题')).toBeVisible())
    await userEvent.click(
      within(canvas.getByRole('toolbar', { name: '主题格式' })).getByRole('button', {
        name: '加粗',
      }),
    )
    await waitFor(async () => {
      await expect(useEditor.getState().history.document.topics.vision?.style?.bold).toBe(false)
      await expect(useEditor.getState().history.document.topics.experience?.style?.bold).toBe(false)
    })
    await expect(canvas.getByTestId('topic-vision')).toHaveClass('is-selected')
    await expect(canvas.getByTestId('topic-experience')).toHaveClass('is-selected')
  },
}

export const SearchAndReplace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole('button', { name: '查找与替换' }),
    )
    const page = within(canvasElement.ownerDocument.body)
    const dialog = within(await page.findByRole('dialog', { name: '查找与替换' }))
    await userEvent.type(dialog.getByRole('textbox', { name: '查找文本' }), '产品')
    await expect(dialog.getByRole('status')).toHaveTextContent('共 3 处匹配')
    await userEvent.type(dialog.getByRole('textbox', { name: '替换为' }), '创作')
    await userEvent.click(dialog.getByRole('button', { name: '替换当前画布全部' }))
    await expect(dialog.getByRole('status')).toHaveTextContent('共 0 处匹配')
    await userEvent.keyboard('{Escape}')
    await expect(canvas.getByTestId('topic-root')).toHaveTextContent('创作规划')
    useEditor.getState().undo()
    await waitFor(() => expect(canvas.getByTestId('topic-root')).toHaveTextContent('产品规划'))
  },
}
