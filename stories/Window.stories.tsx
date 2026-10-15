import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Toolbar } from '../src/renderer/components/Toolbar'
import { TooltipProvider } from '../src/renderer/components/ui/tooltip'
import '../src/renderer/styles/ui.css'
import '../src/renderer/styles/base.css'
import '../src/renderer/styles/chrome.css'
import '../src/renderer/styles/window.css'

const meta = {
  title: 'Trelyx/窗口标题栏',
  component: Toolbar,
  parameters: { layout: 'fullscreen' },
  render: (_, { globals }) => (
    <TooltipProvider>
      <div
        className="app-shell"
        data-platform={globals.platform === 'macos' ? 'macos' : 'windows'}
        data-focused={globals.focused !== false}
        data-fullscreen={globals.fullscreen === true}
      >
        <Toolbar />
      </div>
    </TooltipProvider>
  ),
} satisfies Meta<typeof Toolbar>
export default meta
type Story = StoryObj<typeof meta>

// Native caption buttons are drawn by Electron and appear only in the desktop app.
export const MacOS: Story = { globals: { platform: 'macos' } }
export const WindowsLinux: Story = { globals: { platform: 'windows' } }
export const Inactive: Story = { globals: { platform: 'macos', focused: false } }
export const Fullscreen: Story = {
  globals: { platform: 'macos', fullscreen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: '新建导图' })
    button.focus()
    await expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('新的想法')
  },
}
