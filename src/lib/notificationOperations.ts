import { requireDesktopAPI } from '@renderer/lib/desktop'
import type { NotificationSettings } from '@shared/notifications'

export const readNotificationSettings = (): Promise<NotificationSettings> =>
  requireDesktopAPI().getNotificationSettings()

export const changeNotificationsEnabled = (enabled: boolean): Promise<NotificationSettings> =>
  requireDesktopAPI().setNotificationsEnabled(enabled)
