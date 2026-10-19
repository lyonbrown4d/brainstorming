import type { Meta, StoryObj } from '@storybook/react-vite'
import { AnimatePresence } from 'motion/react'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { createDocument } from '@core'
import { useEditor } from '@renderer/state/editor'
import { setInkMode } from '@renderer/state/canvasInk'
import { WorkbenchPanel } from '@renderer/components/WorkbenchPanel'
import { CanvasOverlay } from '@renderer/components/workbench/CanvasOverlay'
import { DockToolbar } from '@renderer/components/DockToolbar'
import { Button } from '@renderer/components/ui/button'

const MotionWorkbench = () => {
  const outline = useEditor((state) => state.outlineOpen)
  return (
    <div className="relative h-screen overflow-hidden bg-muted/30">
      <div
        id="sheet-panel"
        tabIndex={-1}
        data-testid="persistent-canvas"
        className="absolute inset-0 outline-none"
      />
      <Button
        className="absolute top-4 right-4 z-50"
        onClick={() => {
          useEditor.setState({ outlineOpen: true })
        }}
      >
        显示大纲
      </Button>
      <AnimatePresence initial={false}>
        {outline && (
          <WorkbenchPanel key="outline">
            <aside aria-label="动效大纲" className="h-full w-full p-4">
              <Button
                onClick={() => {
                  useEditor.setState({ outlineOpen: false })
                }}
              >
                关闭动效大纲
              </Button>
            </aside>
          </WorkbenchPanel>
        )}
      </AnimatePresence>
      <CanvasOverlay>
        <DockToolbar>
          <div className="flex h-12 items-center px-2">
            <Button variant="ghost">画布操作</Button>
          </div>
        </DockToolbar>
      </CanvasOverlay>
    </div>
  )
}

const meta = {
  title: 'Brainstorming/工作台交互动效',
  component: MotionWorkbench,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setInkMode('select')
    useEditor.getState().replace(createDocument('动效验收'))
    useEditor.setState({ outlineOpen: true, inspectorOpen: false, busy: false })
  },
} satisfies Meta<typeof MotionWorkbench>
export default meta
type Story = StoryObj<typeof meta>

export const KeyboardFocusAndStableCanvas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const surface = canvas.getByTestId('persistent-canvas')
    const history = useEditor.getState().history
    const close = canvas.getByRole('button', { name: '关闭动效大纲' })
    close.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(surface).toHaveFocus())
    await expect(canvas.getByTestId('persistent-canvas')).toBe(surface)
    await expect(useEditor.getState().history).toBe(history)
    await userEvent.click(canvas.getByRole('button', { name: '显示大纲' }))
    await expect(canvas.getByRole('button', { name: '关闭动效大纲' })).toBeVisible()
    const handle = canvas.getByRole('button', { name: '展开浮动工具栏' })
    await userEvent.click(handle)
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: '画布操作' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect(handle).toHaveFocus()
    await expect(handle).toHaveAttribute('aria-expanded', 'false')
    await expect(canvas.getByTestId('persistent-canvas')).toBe(surface)
    await expect(useEditor.getState().history).toBe(history)
  },
}
