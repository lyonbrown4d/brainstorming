import { useTranslation } from 'react-i18next'
import { messageKeyForLabel, type MessageKey, type MessageTranslator } from '@renderer/i18n'

/** Bind all render-time messages to react-i18next's reactive translation function. */
export const useMessages = () => {
  const { t } = useTranslation()
  const translate: MessageTranslator = (key, values) => t(key, values ?? {})
  const translateLabel = (source: string): string => {
    const key: MessageKey | undefined = messageKeyForLabel(source)
    return key ? translate(key) : source
  }
  return { translate, translateLabel }
}
