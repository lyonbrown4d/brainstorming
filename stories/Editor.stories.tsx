import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { createExampleDocument, applyCommand } from '../src/core'
import { App } from '../src/renderer/src/App'
import { useEditor } from '../src/renderer/src/state/editor'
const meta = {
  title: 'Trelyx/思维导图',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    localStorage.removeItem('trelyx.recovery.v1')
    useEditor.getState().replace(createExampleDocument())
    useEditor.setState({ recovery: null, outlineOpen: false, inspectorOpen: false })
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
    const originalTitle = canvas.getByRole('heading', { level: 1 }).textContent
    await userEvent.dblClick(
      canvas.getByTestId('topic-root').querySelector('.topic-title') ??
        canvas.getByTestId('topic-root'),
    )
    const input = canvas.getByRole('textbox', { name: '编辑主题标题' })
    await userEvent.clear(input)
    await userEvent.type(input, '我的新想法')
    const actions = within(canvas.getByRole('toolbar', { name: '导图操作' }))
    await userEvent.click(actions.getByRole('button', { name: '添加子主题' }))
    await expect(canvas.getByRole('textbox', { name: '编辑主题标题' })).toHaveValue('新主题')
    await expect(canvas.getByTestId('topic-root')).toHaveTextContent('我的新想法')
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(originalTitle)
  },
}
export const StylePanel: Story = {
  beforeEach: () => {
    useEditor.setState({ inspectorOpen: true })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('complementary', { name: '主题面板' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: '样式面板' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(canvas.getByRole('button', { name: '关闭样式面板' }))
    await expect(canvas.queryByRole('complementary', { name: '主题面板' })).not.toBeInTheDocument()
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
    await userEvent.hover(canvas.getByRole('button', { name: '添加子主题' }))
    await expect(await page.findByRole('tooltip')).toHaveTextContent('添加子主题 Tab')
    await userEvent.keyboard('{Escape}')
    await expect(page.queryByRole('tooltip')).not.toBeInTheDocument()
  },
}

export const FileMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: '文件菜单' }))
    await expect(page.getByRole('menuitem', { name: '新建导图' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '打开导图' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '保存导图' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '另存为' })).toBeVisible()
    await userEvent.hover(page.getByRole('menuitem', { name: '最近文件' }))
    await expect(await page.findByText('桌面版会记住最近打开的文件。')).toBeVisible()
    await userEvent.keyboard('{Escape}{Escape}')
  },
}
