import { Languages } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAppLanguage } from '@shared/language'
import { changeLanguage } from '@renderer/i18n'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu'

export const LanguageMenu = () => {
  const { t, i18n } = useTranslation()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const label = t('interfaceLanguage')
  return (
    <div className="relative flex shrink-0 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={label}
            title={label}
            disabled={pending}
          >
            <Languages className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label={label}>
          <DropdownMenuRadioGroup
            value={i18n.language}
            onValueChange={(value) => {
              if (!isAppLanguage(value) || pending) return
              setPending(true)
              setFailed(false)
              void changeLanguage(value)
                .catch(() => {
                  setFailed(true)
                })
                .finally(() => {
                  setPending(false)
                })
            }}
          >
            <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {failed && (
        <span
          role="alert"
          className="absolute top-full right-0 z-50 w-48 rounded-md border border-border bg-popover p-2 text-xs text-destructive"
        >
          {t('languageSaveFailed')}
        </span>
      )}
    </div>
  )
}
