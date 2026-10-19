import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { applyCommand, createDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { setInkMode } from '@renderer/state/canvasInk'

const meta = {
  title: 'Brainstorming/画布自由绘图',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setInkMode('select')
    useEditor.getState().replace(
      applyCommand(createDocument('在导图上标记想法'), {
        type: 'upsertDrawing',
        stroke: {
          id: 'ink-example',
          color: '#e48a38',
          width: 8,
          points: [
            { x: 200, y: 160, pressure: 0.5 },
            { x: 250, y: 120, pressure: 0.7 },
            { x: 310, y: 170, pressure: 0.8 },
            { x: 390, y: 100, pressure: 0.5 },
          ],
        },
      }),
    )
    useEditor.setState({ outlineOpen: false, inspectorOpen: false, recovery: null })
  },
  afterEach: () => {
    setInkMode('select')
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const SelectAndMove: Story = {}
export const Pen: Story = {
  beforeEach: () => {
    setInkMode('pen')
  },
}
export const EraseAndUndo: Story = {
  beforeEach: () => {
    setInkMode('eraser')
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const stroke = canvasElement.querySelector<SVGPathElement>('[data-canvas-stroke="ink-example"]')
    if (!stroke) throw new Error('Saved stroke is missing from canvas')
    const before = useEditor.getState().history
    await userEvent.click(stroke)
    await expect(useEditor.getState().history.document.drawings).toEqual([])
    await expect(useEditor.getState().history.past.length).toBe(before.past.length + 1)
    useEditor.getState().undo()
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-canvas-stroke="ink-example"]')).toBeInTheDocument(),
    )
    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByText('点击笔画移除 · Esc 返回选择')).not.toBeInTheDocument()
  },
}
