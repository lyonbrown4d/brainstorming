import { requireDesktopAPI } from '@renderer/lib/desktop'
import { chordFromEvent } from '@renderer/state/shortcutMatching'
import { getShortcutChord, useShortcutPreferences } from '@renderer/state/shortcutPreferences'
import {
  shortcutDefinitions,
  type ShortcutId,
  type ShortcutScope,
} from '@renderer/state/shortcutRegistry'

/** Resolve one action from the effective bindings. Legacy aliases apply only while defaults are active. */
export const shortcutIdForEvent = (
  event: KeyboardEvent,
  scope: ShortcutScope,
): ShortcutId | null => {
  const platform = requireDesktopAPI().platform
  const chord = chordFromEvent(event, platform)
  if (!chord) return null
  for (const definition of shortcutDefinitions) {
    if (definition.scope !== scope) continue
    if (getShortcutChord(definition.id, platform) === chord) return definition.id
  }
  if (scope !== 'map') return null
  const overrides = useShortcutPreferences.getState().overrides
  if (chord === 'Mod+Shift+Equal' && !Object.prototype.hasOwnProperty.call(overrides, 'zoomIn'))
    return 'zoomIn'
  if (
    chord === 'Mod+Shift+KeyZ' &&
    platform !== 'macos' &&
    platform !== 'ios' &&
    !Object.prototype.hasOwnProperty.call(overrides, 'redo')
  )
    return 'redo'
  return null
}
