import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { applyCommand, createExampleDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { openTopicProperties } from '@stories/properties'
const meta = {
  title: 'Brainstorming/注解与富文本',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    let document = applyCommand(createExampleDocument(), {
      type: 'setTopicMetadata',
      topicId: 'root',
      metadata: {
        labels: ['产品'],
        markers: ['star'],
        task: { done: false, priority: 1, progress: 25 },
        equation: 'E = mc^2',
      },
    })
    document = applyCommand(document, {
      type: 'upsertRelation',
      relation: {
        id: 'story-relation',
        from: 'vision',
        to: 'experience',
        title: '愿景驱动体验',
        dashed: true,
      },
    })
    document = applyCommand(document, {
      type: 'upsertGroup',
      group: {
        id: 'story-group',
        kind: 'boundary',
        topicIds: ['vision-0', 'vision-1'],
        title: '产品原则',
      },
    })
    useEditor.getState().replace(document)
    useEditor.setState({ inspectorOpen: true, outlineOpen: false, recovery: null })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const MetadataAndAnnotations: Story = {}
export const RichNotes: Story = {
  play: async ({ canvasElement }) => {
    const panel = await openTopicProperties(canvasElement)
    await userEvent.click(panel.getByRole('button', { name: 'Markdown 富文本' }))
    const editor = panel.getByRole('textbox', { name: '富文本备注' })
    await userEvent.click(editor)
    await userEvent.type(editor, '可保存的富文本备注')
    await userEvent.tab()
    await waitFor(async () => {
      await expect(useEditor.getState().history.document.topics.root?.notes).toContain(
        '可保存的富文本备注',
      )
    })
    await expect(panel.getByRole('toolbar', { name: '备注文本格式' })).toBeVisible()
  },
}
export const AnnotationCrud: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    await userEvent.click(canvas.getByRole('button', { name: '添加标注' }))
    const input = await canvas.findByRole('textbox', { name: '编辑标注文字' })
    await userEvent.clear(input)
    await userEvent.type(input, '下次迭代验证')
    await userEvent.tab()
    await expect(await canvas.findByRole('button', { name: '标注：下次迭代验证' })).toBeVisible()
    useEditor.getState().undo()
    await waitFor(() => expect(canvas.getByRole('button', { name: '标注：标注' })).toBeVisible())
  },
}
export const CanvasMarkerResize: Story = {
  beforeEach: () => {
    useEditor.getState().command({
      type: 'setTopicMetadata',
      topicId: 'root',
      metadata: { markers: ['star', 'heart'], markerStyle: { position: 'left', size: 32 } },
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const root = within(canvas.getByTestId('topic-root'))
    const handle = root.getByRole('button', { name: '从右侧缩放图标' })
    await userEvent.click(handle)
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.root?.metadata?.markerStyle?.size).toBe(
        33,
      ),
    )
  },
}
