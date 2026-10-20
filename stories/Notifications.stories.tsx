import '@renderer/styles/ui.css'
import '@renderer/styles/base.scss'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { SettingsNotifications } from '@renderer/components/settings/SettingsNotifications'
import { initializeI18n } from '@renderer/i18n'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import { createStoryDesktop } from '@stories/desktopBridge'
import type { NotificationAPI, NotificationSettings } from '@shared/notifications'

const read = fn<NotificationAPI['getNotificationSettings']>()
const enable = fn<NotificationAPI['setNotificationsEnabled']>()
const meta = {
  title: 'Brainstorming/系统通知',
  component: SettingsNotifications,
  decorators: [
    (Story) => (
      <div className="max-w-lg bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
  beforeEach: async () => {
    await initializeI18n('zh-CN')
    queryClient.removeQueries({ queryKey: ['notification-settings'] })
    read.mockReset().mockResolvedValue({ enabled: false, permission: 'granted' })
    enable
      .mockReset()
      .mockImplementation((enabled) => Promise.resolve({ enabled, permission: 'granted' }))
    const restore = installPlatformAPI({
      ...createStoryDesktop(),
      getNotificationSettings: read,
      setNotificationsEnabled: enable,
    })
    return () => {
      restore()
      queryClient.removeQueries({ queryKey: ['notification-settings'] })
    }
  },
} satisfies Meta<typeof SettingsNotifications>
export default meta
type Story = StoryObj<typeof meta>

export const ExplicitEnableOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: '启用通知' })
    await waitFor(() => expect(button).toBeEnabled())
    await expect(enable).not.toHaveBeenCalled()
    await expect(canvas.getByRole('status')).toHaveTextContent('已关闭')
    let grant: (settings: NotificationSettings) => void = () => undefined
    const permission = new Promise<NotificationSettings>((resolve) => {
      grant = resolve
    })
    enable.mockImplementationOnce(() => permission)
    await userEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    await userEvent.keyboard('{Enter}')
    await expect(enable).toHaveBeenCalledWith(true)
    await expect(enable).toHaveBeenCalledTimes(1)
    grant({ enabled: true, permission: 'granted' })
    await expect(await canvas.findByRole('button', { name: '关闭通知' })).toBeEnabled()
    await expect(canvas.getByRole('status')).toHaveTextContent('免打扰模式')
    await userEvent.click(canvas.getByRole('button', { name: '关闭通知' }))
    await waitFor(() => expect(enable).toHaveBeenLastCalledWith(false))
    await expect(canvas.getByRole('status')).toHaveTextContent('已关闭')
  },
}
export const PermissionDenied: Story = {
  beforeEach: () => {
    enable.mockResolvedValue({ enabled: false, permission: 'denied' })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: '启用通知' })
    await waitFor(() => expect(button).toBeEnabled())
    await expect(enable).not.toHaveBeenCalled()
    await userEvent.click(button)
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('系统未允许通知'))
    await expect(button).toBeEnabled()
    await expect(enable).toHaveBeenCalledWith(true)
    await expect(enable).toHaveBeenCalledTimes(1)
  },
}
export const LoadFailure: Story = {
  beforeEach: () => {
    read.mockRejectedValue(new Error('Device unavailable'))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toHaveTextContent('通知设置未能读取或保存')
    await expect(canvas.getByRole('button', { name: '启用通知' })).toBeDisabled()
    read.mockResolvedValue({ enabled: false, permission: 'granted' })
    await userEvent.click(canvas.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(canvas.queryByRole('alert')).not.toBeInTheDocument())
    await expect(canvas.getByRole('button', { name: '启用通知' })).toBeEnabled()
    await expect(enable).not.toHaveBeenCalled()
  },
}
export const SaveFailure: Story = {
  beforeEach: () => {
    enable.mockRejectedValue(new Error('Device unavailable'))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('button', { name: '启用通知' })).toBeEnabled())
    await userEvent.click(canvas.getByRole('button', { name: '启用通知' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('通知设置未能读取或保存')
    await expect(canvas.getByRole('status')).toHaveTextContent('已关闭')
  },
}
export const English: Story = {
  beforeEach: async () => {
    await initializeI18n('en')
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Enable notifications' })).toBeEnabled(),
    )
    await expect(canvas.getByRole('status')).toHaveTextContent('Off')
  },
}
