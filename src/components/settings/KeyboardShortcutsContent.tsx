import { useState } from 'react'
import { useMessages } from '@renderer/i18n/useMessages'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { Input } from '@renderer/components/ui/input'
import { keyboardShortcutReference } from '@renderer/components/settings/keyboardShortcutReference'

export const KeyboardShortcutsContent = () => {
  const { translate, translateLabel } = useMessages()
  const [search, setSearch] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const groups = keyboardShortcutReference(requireDesktopAPI().platform)
    .map((group) => ({
      ...group,
      entries: group.entries.filter(
        ([keys, description]) =>
          !query || `${keys} ${translate(description)}`.toLocaleLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.entries.length)
  return (
    <div className="space-y-5 pb-1">
      <Input
        aria-label={translate('shortcutSearch')}
        placeholder={translate('shortcutSearch')}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
        }}
      />
      {!groups.length && (
        <p className="text-xs text-muted-foreground">{translate('shortcutNoMatches')}</p>
      )}
      {groups.map(({ label: title, entries }) => (
        <section key={title} className="space-y-2">
          <h3 className="text-xs font-semibold text-foreground">{translate(title)}</h3>
          <dl className="divide-y divide-border/70">
            {entries.map(([keys, description]) => (
              <div
                key={keys}
                className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-2.5 text-xs"
              >
                <dt className="min-w-0 flex-1 basis-52 leading-5 text-muted-foreground">
                  {translate(description)}
                </dt>
                <dd className="shrink-0">
                  <kbd className="inline-flex min-h-6 items-center rounded border border-border bg-secondary/70 px-2 font-sans text-[11px] font-medium whitespace-nowrap text-foreground">
                    {translateLabel(keys)}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
