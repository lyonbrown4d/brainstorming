import { version } from '@project/package.json'
import { BrandLogo } from '@renderer/components/BrandLogo'
import { useMessages } from '@renderer/i18n/useMessages'
import { requireDesktopAPI } from '@renderer/lib/desktop'

const platformNames = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
} as const

export const SettingsAbout = () => {
  const { translate } = useMessages()
  return (
    <div className="space-y-6 py-1">
      <div className="flex items-center gap-3">
        <BrandLogo className="size-12 shrink-0" />
        <div>
          <h3 className="text-base font-semibold tracking-tight">Brainstorming</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate('settingsAboutDescription')}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 border-t border-border pt-4 text-xs">
        <dt className="text-muted-foreground">{translate('settingsVersion')}</dt>
        <dd className="text-right tabular-nums">{version}</dd>
        <dt className="text-muted-foreground">{translate('settingsPlatform')}</dt>
        <dd className="text-right">{platformNames[requireDesktopAPI().platform]}</dd>
      </dl>
    </div>
  )
}
