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
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BrandLogo className="size-11" />
        <div>
          <h3 className="font-semibold">Brainstorming</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate('settingsAboutDescription')}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-sm">
        <dt className="text-muted-foreground">{translate('settingsVersion')}</dt>
        <dd>{version}</dd>
        <dt className="text-muted-foreground">{translate('settingsPlatform')}</dt>
        <dd>{platformNames[requireDesktopAPI().platform]}</dd>
      </dl>
    </div>
  )
}
