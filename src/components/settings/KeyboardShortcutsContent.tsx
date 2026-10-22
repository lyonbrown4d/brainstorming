import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useMessages } from '@renderer/i18n/useMessages'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { keyboardShortcutReference } from '@renderer/components/settings/keyboardShortcutReference'
import { chordFromEvent, formatShortcutChord } from '@renderer/state/shortcutMatching'
import {
  getShortcutChord,
  useShortcutPreferences,
  type ShortcutChangeError,
} from '@renderer/state/shortcutPreferences'
import { shortcutDefinitions, type ShortcutId } from '@renderer/state/shortcutRegistry'
import type { MessageKey } from '@renderer/i18n'

const errorMessages: Record<ShortcutChangeError, MessageKey> = {
  invalid: 'shortcutChangeInvalid',
  reserved: 'shortcutChangeReserved',
  conflict: 'shortcutChangeConflict',
}

export const KeyboardShortcutsContent = () => {
  const { translate, translateLabel } = useMessages()
  const platform = requireDesktopAPI().platform
  const overrides = useShortcutPreferences((state) => state.overrides)
  const setChord = useShortcutPreferences((state) => state.setChord)
  const restoreChord = useShortcutPreferences((state) => state.restoreChord)
  const resetAll = useShortcutPreferences((state) => state.resetAll)
  const [search, setSearch] = useState('')
  const [recording, setRecording] = useState<ShortcutId | null>(null)
  const [error, setError] = useState<ShortcutChangeError | null>(null)
  const [errorId, setErrorId] = useState<ShortcutId | null>(null)
  const query = search.trim().toLocaleLowerCase()
  const groups = [
    'settingsShortcutEditing',
    'settingsShortcutNavigation',
    'settingsShortcutFiles',
  ] as const
  const fixedGroups = keyboardShortcutReference(platform)
  const matches = (keys: string, label: MessageKey): boolean =>
    !query || `${keys} ${translate(label)}`.toLocaleLowerCase().includes(query)
  const visible = groups
    .map((group) => ({
      group,
      configurable: shortcutDefinitions.filter(
        (definition) =>
          definition.group === group &&
          matches(
            formatShortcutChord(getShortcutChord(definition.id, platform), platform),
            definition.label,
          ),
      ),
      fixed:
        fixedGroups
          .find((item) => item.label === group)
          ?.entries.filter(([keys, label]) => matches(keys, label)) ?? [],
    }))
    .filter((group) => group.configurable.length || group.fixed.length)
  const record = (id: ShortcutId, event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      setRecording(null)
      setError(null)
      setErrorId(null)
      return
    }
    if (['Meta', 'Control', 'Shift', 'Alt'].includes(event.key)) return
    const chord = chordFromEvent(event.nativeEvent, platform)
    const result = setChord(id, chord ?? '')
    if (result) {
      setError(result)
      setErrorId(id)
    } else {
      setRecording(null)
      setError(null)
      setErrorId(null)
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap gap-2">
        <Input
          className="min-w-40 flex-1"
          aria-label={translate('shortcutSearch')}
          placeholder={translate('shortcutSearch')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetAll()
            setRecording(null)
            setError(null)
            setErrorId(null)
          }}
        >
          {translate('shortcutResetAll')}
        </Button>
      </div>
      <ScrollArea
        type="auto"
        className="min-h-0 flex-1 overscroll-contain"
        aria-label={translate('settingsShortcuts')}
      >
        <div className="space-y-5 pb-1">
          {!visible.length && (
            <p className="text-xs text-muted-foreground">{translate('shortcutNoMatches')}</p>
          )}
          {visible.map(({ group, configurable, fixed }) => (
            <section key={group} className="space-y-2">
              <h3 className="text-xs font-semibold text-foreground">{translate(group)}</h3>
              <div className="divide-y divide-border/70">
                {configurable.map(({ id, label }) => {
                  const chord = getShortcutChord(id, platform)
                  const changed = Object.prototype.hasOwnProperty.call(overrides, id)
                  return (
                    <div
                      key={id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                    >
                      <span className="min-w-0 flex-1 basis-36 text-muted-foreground">
                        {translate(label)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-w-24 font-mono text-[11px]"
                          aria-label={`${translate('shortcutRecord')}: ${translate(label)}`}
                          aria-pressed={recording === id}
                          data-shortcut-recording={recording === id ? 'true' : undefined}
                          onClick={() => {
                            setRecording(id)
                            setError(null)
                            setErrorId(null)
                          }}
                          onKeyDown={(event) => {
                            if (recording === id) record(id, event)
                          }}
                          onBlur={() => {
                            if (recording === id) setRecording(null)
                          }}
                        >
                          {recording === id
                            ? translate('shortcutRecording')
                            : formatShortcutChord(chord, platform)}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={chord === null}
                          aria-label={`${translate('shortcutClear')}: ${translate(label)}`}
                          onClick={() => {
                            setChord(id, null)
                            setError(null)
                            setErrorId(null)
                          }}
                        >
                          {translate('shortcutClear')}
                        </Button>
                        {changed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${translate('shortcutRestore')}: ${translate(label)}`}
                            onClick={() => {
                              const result = restoreChord(id)
                              setError(result)
                              setErrorId(result ? id : null)
                            }}
                          >
                            {translate('shortcutRestore')}
                          </Button>
                        )}
                      </div>
                      {errorId === id && error && (
                        <p role="alert" className="w-full text-destructive">
                          {translate(errorMessages[error])}
                        </p>
                      )}
                    </div>
                  )
                })}
                {fixed.map(([keys, label]) => (
                  <div
                    key={`${keys}:${label}`}
                    className="flex items-center justify-between gap-3 py-2.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 text-muted-foreground">{translate(label)}</span>
                    <span
                      className="shrink-0 text-[11px] text-muted-foreground"
                      aria-label={translate('shortcutFixed')}
                    >
                      {translate('shortcutFixed')}
                    </span>
                    <kbd className="rounded border border-border bg-secondary/70 px-2 py-1 font-sans text-[11px] whitespace-nowrap">
                      {translateLabel(keys)}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
