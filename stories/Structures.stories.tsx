import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { createExampleDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds } from '@renderer/state/selection'
import { openCanvasProperties } from '@stories/properties'

const meta = {
  title: 'Trelyx/图形结构',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useEditor.getState().replace(createExampleDocument())
    useEditor.setState({ recovery: null, inspectorOpen: false, outlineOpen: false })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const ThumbnailSelection: Story = {
  play: async ({ canvasElement }) => {
    const user = userEvent.setup()
    const canvas = within(canvasElement)
    let panel = await openCanvasProperties(canvasElement)
    let picker = within(panel.getByRole('region', { name: '图形结构' }))
    const tree = picker.getByRole('button', { name: '应用向下树形图' })
    tree.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(tree).toHaveAttribute('aria-pressed', 'true'))
    await expect(useEditor.getState().history.document.settings?.layout).toBe('tree-down')
    await user.click(panel.getByRole('button', { name: '关闭属性面板' }))
    await user.click(canvas.getByTestId('topic-vision'))
    await user.keyboard('{Meta>}')
    await user.click(canvas.getByTestId('topic-experience'))
    await user.keyboard('{/Meta}')
    await waitFor(() =>
      expect(selectedTopicIds(useEditor.getState())).toEqual(['vision', 'experience']),
    )
    panel = await openCanvasProperties(canvasElement)
    picker = within(panel.getByRole('region', { name: '图形结构' }))
    await user.click(picker.getByRole('button', { name: '所选分支' }))
    await user.click(picker.getByRole('button', { name: '应用向右括号图' }))
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.vision?.structure).toBe('brace-right'),
    )
    await expect(useEditor.getState().history.document.topics.experience?.structure).toBe(
      'brace-right',
    )
    await user.click(picker.getByRole('button', { name: '恢复跟随上级结构' }))
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.vision?.structure).toBeUndefined(),
    )
    useEditor.getState().undo()
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.vision?.structure).toBe('brace-right'),
    )
  },
}
