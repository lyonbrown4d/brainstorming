import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import { Button } from '@renderer/components/ui/button'

const meta = {
  title: 'Brainstorming/加载状态',
  component: LoadingState,
  args: { label: '正在准备预览…' },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof LoadingState>
export default meta
type Story = StoryObj<typeof meta>

export const Inline: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('正在准备预览…')
    await expect(canvas.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    await expect(canvas.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  },
}

export const Preview: Story = {
  args: { variant: 'surface' },
  decorators: [
    (Story) => (
      <div className="grid h-80 w-[min(30rem,90vw)] place-items-center rounded-lg bg-muted/60">
        <Story />
      </div>
    ),
  ],
}

export const EnglishPreview: Story = {
  ...Preview,
  args: { variant: 'surface', label: 'Preparing preview…' },
}

export const DarkPreview: Story = {
  ...Preview,
  beforeEach: () => {
    const previous = document.documentElement.getAttribute('data-theme')
    document.documentElement.setAttribute('data-theme', 'dark')
    return () => {
      if (previous) document.documentElement.setAttribute('data-theme', previous)
      else document.documentElement.removeAttribute('data-theme')
    }
  },
}

export const ExportStages: Story = {
  render: () => (
    <div className="w-80 space-y-5 rounded-xl bg-background p-6 text-foreground">
      <LoadingState label="正在编码图像…" />
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm">
          取消
        </Button>
        <Button disabled size="sm">
          <LoadingIndicator />
          正在导出…
        </Button>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: '正在导出…' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: '取消' })).toBeEnabled()
  },
}
