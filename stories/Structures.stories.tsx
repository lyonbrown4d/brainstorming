import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { createExampleDocument } from '../src/core'
import { App } from '../src/renderer/src/App'
import { useEditor } from '../src/renderer/src/state/editor'
import { selectedTopicIds } from '../src/renderer/src/state/selection'
import { clearBrowserRecovery } from '../src/renderer/src/state/recovery'

const meta = {
  title: 'Trelyx/图形结构',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: async () => {
    await clearBrowserRecovery()
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
    const page = within(canvasElement.ownerDocument.body)
    await user.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    await user.click(page.getByRole('button', { name: '图形结构' }))
    let picker = within(await page.findByRole('dialog', { name: '图形结构' }))
    const tree = picker.getByRole('button', { name: '应用向下树形图' })
    tree.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(tree).toHaveAttribute('aria-pressed', 'true'))
    await expect(useEditor.getState().history.document.settings?.layout).toBe('tree-down')
    await user.keyboard('{Escape}')
    await user.click(canvas.getByTestId('topic-vision'))
    await user.keyboard('{Meta>}')
    await user.click(canvas.getByTestId('topic-experience'))
    await user.keyboard('{/Meta}')
    await waitFor(() =>
      expect(selectedTopicIds(useEditor.getState())).toEqual(['vision', 'experience']),
    )
    await user.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    await user.click(page.getByRole('button', { name: '图形结构' }))
    picker = within(await page.findByRole('dialog', { name: '图形结构' }))
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
