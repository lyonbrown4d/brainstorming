import { SettingsNotifications } from '@renderer/components/settings/SettingsNotifications'
import { useId, useState } from 'react'
import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { changeLanguage } from '@renderer/i18n'
import { useMessages } from '@renderer/i18n/useMessages'
import { isAppLanguage } from '@shared/language'
import { isAppearanceMode } from '@shared/appAppearance'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'

export const SettingsGeneral = () => {
  const { translate } = useMessages()
  const { i18n } = useTranslation()
  const { theme = 'system', setTheme } = useTheme()
  const languageDescriptionId = useId()
  const appearanceDescriptionId = useId()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const selectLanguage = (value: string): void => {
    if (!isAppLanguage(value) || pending || value === i18n.language) return
    setPending(true)
    setFailed(false)
    void changeLanguage(value)
      .catch(() => {
        setFailed(true)
      })
      .finally(() => {
        setPending(false)
      })
  }
  return (
    <div className="divide-y divide-border">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-4 first:pt-1">
        <div className="min-w-0 flex-1 basis-48 space-y-1">
          <p className="text-sm font-medium">{translate('interfaceLanguage')}</p>
          <p
            id={languageDescriptionId}
            className="max-w-72 text-xs leading-5 text-muted-foreground"
          >
            {translate('settingsLanguageDescription')}
          </p>
        </div>
        <Select value={i18n.language} onValueChange={selectLanguage} disabled={pending}>
          <SelectTrigger
            aria-label={translate('interfaceLanguage')}
            aria-describedby={languageDescriptionId}
            aria-busy={pending}
            className="w-40 shrink-0 text-xs"
          >
            {pending && <LoadingIndicator className="size-3.5" />}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-CN">简体中文</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {failed && (
        <p role="alert" className="py-3 text-xs leading-5 text-destructive">
          {translate('languageSaveFailed')}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-4 first:pt-1">
        <div className="min-w-0 flex-1 basis-48 space-y-1">
          <p className="text-sm font-medium">{translate('appAppearance')}</p>
          <p
            id={appearanceDescriptionId}
            className="max-w-72 text-xs leading-5 text-muted-foreground"
          >
            {translate('settingsAppearanceDescription')}
          </p>
        </div>
        <Select
          value={theme}
          onValueChange={(value) => {
            if (isAppearanceMode(value)) setTheme(value)
          }}
        >
          <SelectTrigger
            aria-label={translate('appAppearance')}
            aria-describedby={appearanceDescriptionId}
            className="w-40 shrink-0 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{translate('system')}</SelectItem>
            <SelectItem value="light">{translate('light')}</SelectItem>
            <SelectItem value="dark">{translate('dark')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SettingsNotifications />
    </div>
  )
}
