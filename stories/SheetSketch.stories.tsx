import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { applyCommand, createExampleDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { openCanvasProperties } from '@stories/properties'

const meta = {
  title: 'Brainstorming/手绘画板',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const document = applyCommand(createExampleDocument(), {
      type: 'batch',
      commands: [
        { type: 'setTopicStyle', topicId: 'vision', style: { shape: 'cloud' } },
        { type: 'setTopicStyle', topicId: 'users', style: { shape: 'sticky' } },
        { type: 'setTopicNotes', topicId: 'users', notes: '手绘风格继续使用主题备注' },
        { type: 'setTopicStyle', topicId: 'experience', style: { shape: 'hexagon' } },
        { type: 'setTopicStyle', topicId: 'plan', style: { shape: 'card' } },
        { type: 'setDocumentSettings', settings: { visualStyle: 'sketch', theme: 'paper' } },
      ],
    })
    useEditor.getState().replace(document)
    useEditor.setState({ busy: false, recovery: null, inspectorOpen: false, outlineOpen: false })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const Light: Story = {}

export const Dark: Story = {
  beforeEach: () => {
    useEditor.getState().command({
      type: 'setDocumentSettings',
      settings: { visualStyle: 'sketch', theme: 'night' },
    })
  },
}

export const ToggleAndUndo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(
        canvas.getByTestId('topic-vision').querySelector('[data-sketch="outline"]'),
      ).toBeInTheDocument(),
    )
    const node = canvas.getByTestId('topic-vision')
    const before = node.getBoundingClientRect()
    const path = node.querySelector('[data-sketch="outline"]')?.getAttribute('d')
    const document = useEditor.getState().history.document
    const panel = await openCanvasProperties(canvasElement, '配色')
    await userEvent.click(panel.getByRole('radio', { name: '标准' }))
    await waitFor(() =>
      expect(node.querySelector('[data-sketch="outline"]')).not.toBeInTheDocument(),
    )
    await expect(useEditor.getState().history.past).toHaveLength(1)
    await expect(useEditor.getState().history.document.topics).toBe(document.topics)
    useEditor.getState().undo()
    await waitFor(() =>
      expect(node.querySelector('[data-sketch="outline"]')?.getAttribute('d')).toBe(path),
    )
    await expect(node.getBoundingClientRect().width).toBe(before.width)
    await expect(node.getBoundingClientRect().height).toBe(before.height)
  },
}
