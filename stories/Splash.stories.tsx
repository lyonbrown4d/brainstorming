import '@renderer/styles/ui.css'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SplashScreen } from '@renderer/components/splash/SplashScreen'

const meta = {
  title: 'Brainstorming/启动窗口',
  component: SplashScreen,
  parameters: { layout: 'fullscreen' },
  args: {
    phase: 'loading',
    language: 'zh-CN',
    retrying: false,
    onRetry: fn(),
    onQuit: fn(),
  },
} satisfies Meta<typeof SplashScreen>
export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('正在准备工作空间…')
    await expect(canvas.queryByRole('button', { name: '重新加载' })).not.toBeInTheDocument()
  },
}

export const English: Story = { args: { language: 'en' } }

export const Dark: Story = {
  args: { language: 'en' },
  beforeEach: () => {
    const previous = document.documentElement.getAttribute('data-theme')
    document.documentElement.setAttribute('data-theme', 'dark')
    return () => {
      if (previous) document.documentElement.setAttribute('data-theme', previous)
      else document.documentElement.removeAttribute('data-theme')
    }
  },
}

export const Slow: Story = {
  args: { phase: 'slow', language: 'en' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('Startup is taking longer')
    await userEvent.click(canvas.getByRole('button', { name: 'Reload' }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
  },
}

export const Failed: Story = {
  args: { phase: 'failed' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('界面加载失败')
    await userEvent.click(canvas.getByRole('button', { name: '重新加载' }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: '退出 Brainstorming' }))
    await expect(args.onQuit).toHaveBeenCalledOnce()
  },
}

export const Retrying: Story = {
  args: { phase: 'failed', retrying: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: '重新加载' })).toBeDisabled()
  },
}
