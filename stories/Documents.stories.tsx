import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { applyCommand, createExampleDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { openCanvasProperties, openTopicProperties } from '@stories/properties'
import { defaultTopicFilters, useTopicFilters } from '@renderer/components/documents/filterTopics'

const meta = {
  title: 'Brainstorming/布局模板与演示',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    let document = applyCommand(createExampleDocument(), {
      type: 'setDocumentSettings',
      settings: { theme: 'ocean' },
    })
    document = applyCommand(document, {
      type: 'setTopicMetadata',
      topicId: 'vision-0',
      metadata: { labels: ['研究'], markers: ['star'], task: { done: false, priority: 1 } },
    })
    document = applyCommand(document, {
      type: 'setPresentation',
      steps: [{ topicId: 'root' }, { topicId: 'vision' }],
    })
    useEditor.getState().replace(document)
    useEditor.setState({ recovery: null, inspectorOpen: false, outlineOpen: false })
    useTopicFilters.setState(defaultTopicFilters)
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const DockCollapsed: Story = {}
export const DockExpanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByRole('button', { name: '展开浮动工具栏' })
    await userEvent.hover(handle)
    await expect(handle).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(canvas.getByRole('toolbar', { name: '导图操作' })).toBeVisible())
  },
}
export const EditableTemplate: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body)
    const panel = await openCanvasProperties(canvasElement, '模板')
    await userEvent.click(panel.getByRole('button', { name: '模板' }))
    const dialog = within(await page.findByRole('dialog', { name: '从模板创建' }))
    await userEvent.click(dialog.getByRole('button', { name: /学习笔记/ }))
    await waitFor(async () => {
      await expect(useEditor.getState().history.document.title).toBe('学习笔记')
    })
    await expect(canvas.getByTestId('topic-root')).toHaveTextContent('学习笔记')
  },
}
export const SemanticFilter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body)
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    await userEvent.click(page.getByRole('button', { name: '主题筛选' }))
    await userEvent.click(page.getByRole('combobox', { name: '筛选任务状态' }))
    await userEvent.click(await page.findByRole('option', { name: '未完成任务' }))
    await expect(page.getByRole('button', { name: '筛选结果：让思考自由生长' })).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: '筛选结果：让思考自由生长' }))
    await waitFor(async () => {
      await expect(useEditor.getState().selectedId).toBe('vision-0')
    })
  },
}

export const TopicMarkers: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByTestId('topic-vision'))
    const panel = await openTopicProperties(canvasElement)
    await userEvent.click(panel.getByRole('button', { name: '优先级 2' }))
    await userEvent.click(panel.getByRole('button', { name: '星标' }))
    await expect(canvas.getByTestId('topic-vision')).toHaveTextContent('P2')
    await expect(within(canvas.getByTestId('topic-vision')).getByLabelText('星标')).toBeVisible()
  },
}
