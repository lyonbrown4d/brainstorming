import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { createExampleDocument, applyCommand } from '../src/core'
import { App } from '../src/renderer/App'
import { useEditor } from '../src/renderer/state/editor'
const meta = {
  title: 'Trelyx/思维导图',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    localStorage.removeItem('trelyx.recovery.v1')
    useEditor.getState().replace(createExampleDocument())
    useEditor.setState({ recovery: null, outlineOpen: false })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const LongTitles: Story = {
  beforeEach: () => {
    const document = createExampleDocument()
    const child = document.topics[document.rootId]?.children[0]
    useEditor.getState().replace(
      child
        ? applyCommand(document, {
            type: 'renameTopic',
            topicId: child,
            title: '让每一个复杂的想法都能自然展开，中文长标题也能清晰呈现',
          })
        : document,
    )
  },
}
export const KeyboardEditing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /编辑标题/ }))
    const input = canvas.getByRole('textbox', { name: '编辑主题标题' })
    await userEvent.clear(input)
    await userEvent.type(input, '我的新想法')
    await userEvent.click(canvas.getByRole('button', { name: /添加子主题/ }))
    await expect(canvas.getByRole('textbox', { name: '编辑主题标题' })).toHaveValue('新主题')
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('我的新想法')
  },
}
export const OutlineView: Story = {
  beforeEach: () => {
    useEditor.setState({ outlineOpen: true })
  },
}

export const KeyboardHelpDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole('button', { name: '键盘快捷键' })
    await userEvent.click(trigger)
    const dialog = await page.findByRole('dialog', { name: '键盘快捷键' })
    await expect(dialog).toBeVisible()
    await expect(within(dialog).getByText('Windows / Linux 使用 Ctrl 代替 ⌘。')).toBeVisible()
    await userEvent.tab()
    await expect(within(dialog).getByRole('button', { name: '关闭快捷键' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
    await expect(trigger).toHaveFocus()
  },
}

export const ToolbarHints: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.hover(canvas.getByRole('button', { name: '新建导图' }))
    await expect(await page.findByRole('tooltip')).toHaveTextContent('新建导图 ⌘N')
    await userEvent.keyboard('{Escape}')
    await expect(page.queryByRole('tooltip')).not.toBeInTheDocument()
  },
}
