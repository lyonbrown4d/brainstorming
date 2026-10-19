/** Device preference and permission reported by the native notification service. */
export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unavailable'
export interface NotificationSettings {
  readonly enabled: boolean
  readonly permission: NotificationPermission
}
export interface NotificationAPI {
  getNotificationSettings(): Promise<NotificationSettings>
  /** Only call from an explicit enable/disable action. Enabling may request OS permission. */
  setNotificationsEnabled(enabled: boolean): Promise<NotificationSettings>
}
