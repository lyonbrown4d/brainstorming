import type { AppLanguage } from '@shared/language'

const messages = {
  title: ['Brainstorming — 正在启动', 'Brainstorming — Starting'],
  screen: ['启动 Brainstorming', 'Starting Brainstorming'],
  loading: ['正在准备工作空间…', 'Preparing your workspace…'],
  slow: [
    '启动时间较长，请稍候；也可以重试。',
    'Startup is taking longer than expected. Please wait or retry.',
  ],
  failed: [
    '界面加载失败，请重试或退出应用。',
    'The interface could not load. Retry or quit the app.',
  ],
  handoffFailed: [
    '原生应用启动失败，请重新加载。',
    'The app could not finish starting. Reload to retry.',
  ],
  retry: ['重新加载', 'Reload'],
  quit: ['退出 Brainstorming', 'Quit Brainstorming'],
} as const

// Fixed startup copy stays usable before the application's translation runtime loads.
export const splashText = (key: keyof typeof messages, language: AppLanguage): string =>
  messages[key][language === 'zh-CN' ? 0 : 1]
