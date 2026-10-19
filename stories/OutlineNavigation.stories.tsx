import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createExampleDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'

const meta = {
  title: 'Brainstorming/大纲定位',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useEditor.getState().replace(createExampleDocument())
    useEditor.setState({ recovery: null, outlineOpen: true, inspectorOpen: true })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const EveryTopic: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const outline = within(canvas.getByRole('complementary', { name: '文档大纲' }))
    for (const [id, title] of [
      ['vision', '产品愿景'],
      ['plan-1', '打磨桌面体验'],
      ['users', '目标用户'],
      ['vision', '产品愿景'],
    ] as const) {
      await userEvent.click(outline.getByRole('button', { name: title }))
      await waitFor(async () => {
        await expect(useEditor.getState().selectedId).toBe(id)
        const node = canvas.getByTestId(`topic-${id}`)
        const flow = node.closest('.react-flow')?.getBoundingClientRect()
        if (!flow) throw new Error('Canvas viewport is not ready')
        const bounds = node.getBoundingClientRect()
        const left = flow.width >= 768 ? 216 : 0
        const right = flow.width >= 768 ? 272 : 0
        await expect(
          Math.abs(bounds.x + bounds.width / 2 - (flow.x + (flow.width + left - right) / 2)),
        ).toBeLessThan(3)
        await expect(canvasElement.ownerDocument.getElementById('sheet-panel')).toHaveFocus()
      })
    }
    await expect(useEditor.getState().history.past).toHaveLength(0)
  },
}
