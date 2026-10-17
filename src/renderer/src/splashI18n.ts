import i18next from 'i18next'
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
  retry: ['重新加载', 'Reload'],
  quit: ['退出 Brainstorming', 'Quit Brainstorming'],
} as const

// This entry has no document bridge or React tree; keep its translator independent.
const translation = i18next.createInstance()
void translation.init({
  resources: {
    'zh-CN': {
      translation: Object.fromEntries(
        Object.entries(messages).map(([key, pair]) => [key, pair[0]]),
      ),
    },
    en: {
      translation: Object.fromEntries(
        Object.entries(messages).map(([key, pair]) => [key, pair[1]]),
      ),
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['zh-CN', 'en'],
  initAsync: false,
  interpolation: { escapeValue: false },
})

export const splashText = (key: keyof typeof messages, language: AppLanguage): string =>
  translation.t(key, { lng: language })
