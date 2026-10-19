export const notificationMessages = {
  systemNotifications: ['系统通知', 'System notifications'],
  notificationDescription: [
    '导出完成时提醒。通知不包含导图内容或文件路径。',
    'Notify when an export completes. Notifications contain no map content or file paths.',
  ],
  notificationEnable: ['启用通知', 'Enable notifications'],
  notificationDisable: ['关闭通知', 'Disable notifications'],
  notificationLoading: ['正在读取通知设置…', 'Loading notification settings…'],
  notificationOff: ['已关闭', 'Off'],
  notificationGranted: [
    '已启用，实际显示由系统通知设置和免打扰模式决定。',
    'Enabled. Delivery depends on system notification settings and Do Not Disturb.',
  ],
  notificationDenied: [
    '系统未允许通知。请在系统设置中允许后重试启用。',
    'Notifications are blocked. Allow them in system settings, then try enabling again.',
  ],
  notificationPrompt: [
    '尚未获得系统通知权限。',
    'System notification permission has not been granted.',
  ],
  notificationUnavailable: [
    '系统通知暂不可用，请稍后重试。',
    'System notifications are unavailable. Please try again later.',
  ],
  notificationFailed: [
    '通知设置未能读取或保存，请重试。',
    'Notification settings could not be loaded or saved. Please try again.',
  ],
  notificationRetry: ['重试', 'Retry'],
} as const
