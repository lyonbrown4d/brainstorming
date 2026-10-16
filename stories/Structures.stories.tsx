import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { createExampleDocument } from '../src/core'
import { App } from '../src/renderer/src/App'
import { useEditor } from '../src/renderer/src/state/editor'
import { setSelectedTopics } from '../src/renderer/src/state/selection'
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
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.hover(canvas.getByRole('button', { name: '展开浮动工具栏' }))
    await userEvent.click(page.getByRole('button', { name: '图形结构' }))
    const picker = within(await page.findByRole('dialog', { name: '图形结构' }))
    const tree = picker.getByRole('button', { name: '应用向下树形图' })
    tree.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(tree).toHaveAttribute('aria-pressed', 'true'))
    await expect(useEditor.getState().history.document.settings?.layout).toBe('tree-down')
    setSelectedTopics(['vision', 'experience'])
    await userEvent.click(picker.getByRole('button', { name: '所选分支' }))
    await userEvent.click(picker.getByRole('button', { name: '应用向右括号图' }))
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.vision?.structure).toBe('brace-right'),
    )
    await expect(useEditor.getState().history.document.topics.experience?.structure).toBe(
      'brace-right',
    )
    await userEvent.click(picker.getByRole('button', { name: '恢复跟随上级结构' }))
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.vision?.structure).toBeUndefined(),
    )
    useEditor.getState().undo()
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.vision?.structure).toBe('brace-right'),
    )
  },
}
