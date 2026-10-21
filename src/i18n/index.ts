import { spatialMessages } from '@renderer/i18n/spatialMessages'
import { topicWidthMessages } from '@renderer/i18n/topicWidthMessages'
import { shortcutCustomizationMessages } from '@renderer/i18n/shortcutCustomizationMessages'
import { summaryMessages } from '@renderer/i18n/summaryMessages'
import { priorityMessages } from '@renderer/i18n/priorityMessages'
import { artMessages } from '@renderer/i18n/artMessages'
import { exportMessages } from '@renderer/i18n/exportMessages'
import { relationMessages } from '@renderer/i18n/relationMessages'
import { templateMessages } from '@renderer/i18n/templateMessages'
import { notificationMessages } from '@renderer/i18n/notificationMessages'
import { commandMessages } from '@renderer/i18n/commandMessages'
import { creationMessages } from '@renderer/i18n/creationMessages'
import { sketchMessages } from '@renderer/i18n/sketchMessages'
import { settingsMessages } from '@renderer/i18n/settingsMessages'
import { inkMessages } from '@renderer/i18n/inkMessages'
import { topicAppearanceMessages } from '@renderer/i18n/topicAppearanceMessages'
import { presentationMessages } from '@renderer/i18n/presentationMessages'
import { resourceMessages } from '@renderer/i18n/resourceMessages'
import { interfaceMessages } from '@renderer/i18n/interfaceMessages'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { documentTabMessages } from '@renderer/i18n/documentTabs'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { isAppLanguage, type AppLanguage } from '@shared/language'
import { messages0 } from '@renderer/i18n/messages0'
import { messages1 } from '@renderer/i18n/messages1'
import { messages2 } from '@renderer/i18n/messages2'
import { messages3 } from '@renderer/i18n/messages3'
import { messages4 } from '@renderer/i18n/messages4'
import { messages5 } from '@renderer/i18n/messages5'
import { messages6 } from '@renderer/i18n/messages6'
import { messages7 } from '@renderer/i18n/messages7'
import { messages8 } from '@renderer/i18n/messages8'

const messages = {
  ...spatialMessages,
  ...topicWidthMessages,
  ...shortcutCustomizationMessages,
  ...summaryMessages,
  ...priorityMessages,
  ...artMessages,
  ...exportMessages,
  ...relationMessages,
  ...templateMessages,
  ...notificationMessages,
  ...commandMessages,
  ...creationMessages,
  ...sketchMessages,
  ...settingsMessages,
  ...inkMessages,
  ...topicAppearanceMessages,
  ...presentationMessages,
  ...resourceMessages,
  ...interfaceMessages,
  ...documentTabMessages,
  ...messages0,
  ...messages1,
  ...messages2,
  ...messages3,
  ...messages4,
  ...messages5,
  ...messages6,
  ...messages8,
  ...messages7,
}
export type MessageKey = keyof typeof messages
const resources = {
  'zh-CN': {
    translation: Object.fromEntries(Object.entries(messages).map(([key, pair]) => [key, pair[0]])),
  },
  en: {
    translation: Object.fromEntries(Object.entries(messages).map(([key, pair]) => [key, pair[1]])),
  },
}
export const i18n = i18next.createInstance()

const initialized = i18n.use(initReactI18next).init({
  resources,
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  supportedLngs: ['zh-CN', 'en'],
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
})

export const initializeI18n = async (language: AppLanguage = 'zh-CN'): Promise<void> => {
  await initialized
  await i18n.changeLanguage(language)
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

export type MessageTranslator = (
  key: MessageKey,
  values?: Record<string, string | number>,
) => string

export const translate: MessageTranslator = (key, values) => i18n.t(key, values ?? {})

/** Only for application-owned option labels; never pass document content here. */
const sourceKeys = new Map<string, MessageKey>(
  Object.entries(messages).map(([key, pair]) => [pair[0], key as MessageKey]),
)
export const messageKeyForLabel = (source: string): MessageKey | undefined => sourceKeys.get(source)

export const translateLabel = (source: string): string => {
  const key = messageKeyForLabel(source)
  return key ? translate(key) : source
}

export const changeLanguage = async (language: AppLanguage): Promise<void> => {
  const saved = await requireDesktopAPI().setLanguage(language)
  if (!isAppLanguage(saved)) throw new Error('Unsupported application language')
  await i18n.changeLanguage(saved)
  document.documentElement.lang = saved
}
