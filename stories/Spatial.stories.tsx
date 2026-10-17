import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { createExampleDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { useSpatialView } from '@renderer/state/spatial'
import { clearBrowserRecovery } from '@renderer/state/recovery'

const meta = {
  title: 'Trelyx/空间视图',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: async () => {
    await clearBrowserRecovery()
    useEditor.getState().replace(createExampleDocument())
    useEditor.setState({ selectedId: 'root', inspectorOpen: false, outlineOpen: false })
    useSpatialView.getState().setMode(useEditor.getState().activeSheetId, '3d')
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const topic = await canvas.findByRole(
      'button',
      { name: '选择主题 核心体验' },
      { timeout: 10000 },
    )
    await expect(topic).toBeVisible()
    await userEvent.click(topic)
    await userEvent.click(canvas.getByRole('button', { name: '聚焦主题 核心体验' }))
    await expect(canvas.getByRole('navigation', { name: '聚焦路径' })).toHaveTextContent('核心体验')
    await userEvent.click(canvas.getByRole('button', { name: '返回全图' }))
    await expect(canvas.queryByRole('navigation', { name: '聚焦路径' })).not.toBeInTheDocument()
  },
}

export const InlineEditing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const topic = await canvas.findByRole(
      'button',
      { name: '选择主题 核心体验' },
      { timeout: 10000 },
    )
    await userEvent.dblClick(topic)
    const editor = await canvas.findByRole('textbox', { name: '编辑主题标题' })
    await expect(editor).toHaveFocus()
    const modifier = /Macintosh|Mac OS/.test(navigator.userAgent) ? 'Meta' : 'Control'
    await userEvent.keyboard(`{${modifier}>}a{/${modifier}}{Backspace}`)
    await userEvent.type(editor, '空间编辑')
    await userEvent.click(canvas.getByRole('button', { name: '二维视图' }))
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.experience?.title).toBe('空间编辑'),
    )
    await expect(canvas.getByTestId('topic-experience')).toHaveTextContent('空间编辑')
  },
}

export const GroupSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const user = userEvent.setup()
    const first = await canvas.findByRole(
      'button',
      { name: '选择主题 让思考自由生长' },
      { timeout: 10000 },
    )
    const second = canvas.getByRole('button', { name: '选择主题 本地优先' })
    await user.click(first)
    const modifier = /Macintosh|Mac OS/.test(navigator.userAgent) ? 'Meta' : 'Control'
    await user.keyboard(`{${modifier}>}`)
    await user.click(second)
    await user.keyboard(`{/${modifier}}`)
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(second).toHaveAttribute('aria-pressed', 'true')
    await user.click(canvas.getByRole('button', { name: '二维视图' }))
    await expect(canvas.getByTestId('topic-vision-0').closest('.react-flow__node')).toHaveClass(
      'selected',
    )
    await expect(canvas.getByTestId('topic-vision-1').closest('.react-flow__node')).toHaveClass(
      'selected',
    )
  },
}
