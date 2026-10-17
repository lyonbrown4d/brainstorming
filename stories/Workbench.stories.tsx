import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { applyCommand, createExampleDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { setSelectedTopics, useSelection } from '@renderer/state/selection'
import { useSpatialView } from '@renderer/state/spatial'
import { openTopicProperties } from '@stories/properties'

const meta = {
  title: 'Brainstorming/结构工作台',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useSelection.setState({ sheets: {} })
    useEditor.getState().replace(createExampleDocument())
    useEditor.setState({ recovery: null, outlineOpen: true, inspectorOpen: true })
    useSpatialView.getState().setMode(useEditor.getState().activeSheetId, '2d')
    setSelectedTopics(['vision'])
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('complementary', { name: '文档大纲' })).toBeVisible()
    const panel = await openTopicProperties(canvasElement)
    await expect(panel.getByRole('heading', { name: '属性' })).toBeVisible()
    await expect(panel.getByRole('combobox', { name: '主题形状' })).toBeVisible()
  },
}

export const MultipleSelection: Story = {
  beforeEach: () => {
    const document = applyCommand(useEditor.getState().history.document, {
      type: 'setTopicMetadata',
      topicId: 'vision-0',
      metadata: { labels: ['保留标签'] },
    })
    useEditor.getState().replace(document)
    useEditor.setState({ outlineOpen: true, inspectorOpen: true })
    setSelectedTopics(['vision-0', 'vision-1'])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = await openTopicProperties(canvasElement)
    const outline = within(canvas.getByRole('complementary', { name: '文档大纲' }))
    await expect(
      panel.getByText(/已选\s*2\s*个主题；样式和标记将应用到全部所选主题。/),
    ).toBeVisible()
    await expect(outline.getByRole('button', { name: '让思考自由生长' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(outline.getByRole('button', { name: '本地优先' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(panel.queryByText('主题名称')).not.toBeInTheDocument()
    await expect(panel.queryByRole('button', { name: '删除分支' })).not.toBeInTheDocument()
    await userEvent.click(panel.getByRole('button', { name: '填充：薄荷' }))
    await waitFor(async () => {
      for (const id of ['vision-0', 'vision-1'])
        await expect(useEditor.getState().history.document.topics[id]?.style?.fill).toBe('#bcecdf')
    })
    useEditor.getState().undo()
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics['vision-0']?.style?.fill).toBeUndefined(),
    )
    await userEvent.click(panel.getByRole('button', { name: '添加标记' }))
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByRole('button', { name: '星标' }))
    await waitFor(async () => {
      for (const id of ['vision-0', 'vision-1'])
        await expect(useEditor.getState().history.document.topics[id]?.metadata?.markers).toEqual([
          'star',
        ])
    })
    await expect(
      useEditor.getState().history.document.topics['vision-0']?.metadata?.labels,
    ).toEqual(['保留标签'])
    await userEvent.keyboard('{Escape}')
    const user = userEvent.setup()
    await user.keyboard('{Shift>}')
    await user.click(outline.getByRole('button', { name: '产品愿景' }))
    await user.keyboard('{/Shift}')
    await expect(useSelection.getState().sheets[useEditor.getState().activeSheetId]).toHaveLength(3)
    await expect(panel.getByText(/已选\s*3\s*个主题；/)).toBeVisible()
  },
}
