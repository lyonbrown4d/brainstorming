import { useState } from 'react'
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-sm space-y-1">
          <p className="text-sm font-medium">{translate('interfaceLanguage')}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {translate('settingsLanguageDescription')}
          </p>
        </div>
        <Select value={i18n.language} onValueChange={selectLanguage} disabled={pending}>
          <SelectTrigger aria-label={translate('interfaceLanguage')} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-CN">简体中文</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {translate('languageSaveFailed')}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-sm space-y-1">
          <p className="text-sm font-medium">{translate('appAppearance')}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {translate('settingsAppearanceDescription')}
          </p>
        </div>
        <Select
          value={theme}
          onValueChange={(value) => {
            if (isAppearanceMode(value)) setTheme(value)
          }}
        >
          <SelectTrigger aria-label={translate('appAppearance')} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{translate('system')}</SelectItem>
            <SelectItem value="light">{translate('light')}</SelectItem>
            <SelectItem value="dark">{translate('dark')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
