import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { applyCommand, createExampleDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { openTopicProperties } from '@stories/properties'

const contentDocument = () => {
  let document = createExampleDocument()
  document = applyCommand(document, {
    type: 'setTopicImage',
    topicId: 'root',
    width: 64,
    height: 32,
    asset: {
      id: 'sample-image',
      name: '灵感色卡.png',
      mimeType: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAATklEQVR4nO3PUQkAIBTAwNfZCmYzlyH8OITBAtxmr/N1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjx2AVy66MQNatJXAAAAAElFTkSuQmCC',
    },
  })
  document = applyCommand(document, {
    type: 'setTopicNotes',
    topicId: 'root',
    notes: '先记录想法，再整理结构。\n备注保留换行。',
  })
  return applyCommand(document, {
    type: 'addTopicAttachment',
    topicId: 'root',
    asset: {
      id: 'sample-file',
      name: '参考资料.txt',
      mimeType: 'application/octet-stream',
      data: 'VHJlbHl4',
    },
  })
}

const meta = {
  title: 'Brainstorming/主题内容',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useEditor.getState().replace(contentDocument())
    useEditor.setState({ selectedId: 'root', inspectorOpen: true, outlineOpen: false })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const NotesImagesAttachments: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    const panel = await openTopicProperties(canvasElement)
    await expect(panel.getByRole('textbox', { name: '主题备注' })).toHaveTextContent(
      '备注保留换行。',
    )
    await expect(panel.getByRole('img', { name: '灵感色卡.png' })).toBeVisible()
    await expect(panel.getByText('参考资料.txt')).toBeVisible()
    await userEvent.click(panel.getByRole('button', { name: '预览图片' }))
    const page = within(canvasElement.ownerDocument.body)
    const preview = await page.findByRole('dialog', { name: '主题图片' })
    await expect(within(preview).getByRole('img', { name: '灵感色卡.png' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
    await expect(panel.getByRole('button', { name: '预览图片' })).toHaveFocus()
    await userEvent.click(panel.getByRole('button', { name: '移除图片' }))
    await expect(panel.queryByRole('img')).not.toBeInTheDocument()
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    await userEvent.click(canvas.getByRole('button', { name: /^撤销/ }))
    await expect(panel.getByRole('img', { name: '灵感色卡.png' })).toBeVisible()
    await userEvent.click(panel.getByRole('button', { name: '移除附件 参考资料.txt' }))
    await expect(panel.queryByText('参考资料.txt')).not.toBeInTheDocument()
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    await userEvent.click(canvas.getByRole('button', { name: /^撤销/ }))
    await expect(panel.getByText('参考资料.txt')).toBeVisible()
  },
}

export const MultilineNotes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    const panel = await openTopicProperties(canvasElement)
    const notes = panel.getByRole('textbox', { name: '主题备注' })
    const title = panel.getByRole('textbox', { name: '主题名称' }).textContent
    await userEvent.click(notes)
    const modifier = /Macintosh|Mac OS/.test(navigator.userAgent) ? 'Meta' : 'Control'
    await userEvent.keyboard(`{${modifier}>}a{/${modifier}}{Backspace}`)
    await userEvent.type(notes, '第一行{Enter}第二行')
    await userEvent.tab()
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.root?.notes).toBe('第一行\n第二行'),
    )
    await expect(panel.getByRole('textbox', { name: '主题名称' })).toHaveTextContent(title)
  },
}

export const NotesFromCanvas: Story = {
  beforeEach: () => {
    useEditor.setState({ inspectorOpen: false })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    const root = within(canvas.getByTestId('topic-root'))
    await userEvent.click(root.getByRole('button', { name: '查看主题备注' }))
    await expect(canvas.getByRole('complementary', { name: '属性面板' })).toBeVisible()
    const panel = await openTopicProperties(canvasElement)
    await expect(panel.getByRole('textbox', { name: '主题备注' })).toHaveTextContent(
      '备注保留换行。',
    )
  },
}

export const FormattingControls: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    const page = within(canvasElement.ownerDocument.body)
    const panel = await openTopicProperties(canvasElement)
    await userEvent.click(panel.getByRole('button', { name: '表现形态' }))
    await userEvent.click(await page.findByRole('button', { name: '椭圆' }))
    await expect(panel.getByRole('button', { name: '表现形态' })).toHaveTextContent('椭圆')
    await userEvent.click(panel.getByRole('combobox', { name: '字号' }))
    await userEvent.click(await page.findByRole('option', { name: '20' }))
    await expect(panel.getByRole('combobox', { name: '字号' })).toHaveTextContent('20')
    await userEvent.click(panel.getByRole('combobox', { name: '分支线型' }))
    await userEvent.click(await page.findByRole('option', { name: '直线' }))
    await expect(panel.getByRole('combobox', { name: '分支线型' })).toHaveTextContent('直线')
    await expect(canvas.getByTestId('topic-root')).toHaveStyle({ borderRadius: '50%' })
  },
}

export const SearchAppearances: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = await openTopicProperties(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const original = useEditor.getState().history.document
    const pastLength = useEditor.getState().history.past.length
    await userEvent.click(panel.getByRole('button', { name: '表现形态' }))
    const search = await page.findByRole('textbox', { name: '搜索表现形态' })
    await userEvent.type(search, '不存在的形态')
    await expect(page.getByText('没有匹配的形态')).toBeVisible()
    await userEvent.clear(search)
    await userEvent.type(search, '便签')
    await userEvent.click(page.getByRole('button', { name: /^便签$/ }))
    await waitFor(() =>
      expect(canvas.getByTestId('topic-root')).toHaveAttribute('data-appearance', 'sticky'),
    )
    await expect(canvas.getByTestId('topic-root')).toHaveTextContent('先记录想法，再整理结构。')
    await expect(useEditor.getState().history.document.topics.root).toEqual({
      ...original.topics.root,
      style: { shape: 'sticky' },
    })
    await expect(useEditor.getState().history.past).toHaveLength(pastLength + 1)
    useEditor.getState().undo()
    await waitFor(() => expect(useEditor.getState().history.document).toBe(original))
    await userEvent.click(panel.getByRole('button', { name: '表现形态' }))
    await expect(page.getByRole('textbox', { name: '搜索表现形态' })).toHaveValue('')
    await userEvent.keyboard('{Escape}')
  },
}

export const ImageAppearanceEmpty: Story = {
  beforeEach: () => {
    const state = useEditor.getState()
    state.command({
      type: 'batch',
      commands: [
        { type: 'removeTopicImage', topicId: 'root' },
        { type: 'setTopicStyle', topicId: 'root', style: { shape: 'image' } },
      ],
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const root = within(canvas.getByTestId('topic-root'))
    await expect(root.getByRole('button', { name: '添加图片' })).toBeVisible()
    await expect(root.queryByRole('img')).not.toBeInTheDocument()
    await expect(useEditor.getState().history.document.topics.root?.notes).toContain(
      '备注保留换行。',
    )
    await expect(useEditor.getState().history.document.topics.root?.attachments).toEqual([
      'sample-file',
    ])
  },
}
