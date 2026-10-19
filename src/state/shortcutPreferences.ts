import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { DesktopPlatform } from '@shared/window'
import {
  defaultShortcutChord,
  isShortcutId,
  reservedShortcutChords,
  shortcutDefinitions,
  type ShortcutId,
} from '@renderer/state/shortcutRegistry'
import { isValidShortcutChord } from '@renderer/state/shortcutMatching'

export type ShortcutOverrides = Partial<Record<ShortcutId, string | null>>
export type ShortcutChangeError = 'invalid' | 'reserved' | 'conflict'
interface ShortcutPreferences {
  readonly overrides: ShortcutOverrides
  setChord: (id: ShortcutId, chord: string | null) => ShortcutChangeError | null
  restoreChord: (id: ShortcutId) => ShortcutChangeError | null
  resetAll: () => void
}

const platforms: readonly DesktopPlatform[] = ['macos', 'windows']
const effectiveChord = (
  id: ShortcutId,
  platform: DesktopPlatform,
  overrides: ShortcutOverrides,
): string | null =>
  Object.prototype.hasOwnProperty.call(overrides, id)
    ? (overrides[id] ?? null)
    : defaultShortcutChord(id, platform)

const validateChange = (
  id: ShortcutId,
  chord: string | null,
  current: ShortcutOverrides,
): ShortcutChangeError | null => {
  if (chord === null) return null
  if (!isValidShortcutChord(chord)) return 'invalid'
  if (platforms.some((platform) => reservedShortcutChords(platform).has(chord))) return 'reserved'
  const next = { ...current, [id]: chord }
  for (const platform of platforms) {
    for (const definition of shortcutDefinitions) {
      if (definition.id !== id && effectiveChord(definition.id, platform, next) === chord)
        return 'conflict'
    }
  }
  return null
}

const firstShortcutConflict = (overrides: ShortcutOverrides): ShortcutId | null => {
  for (const platform of platforms) {
    const seen = new Map<string, ShortcutId>()
    for (const definition of shortcutDefinitions) {
      const chord = effectiveChord(definition.id, platform, overrides)
      if (!chord) continue
      const previous = seen.get(chord)
      if (previous)
        return Object.prototype.hasOwnProperty.call(overrides, definition.id)
          ? definition.id
          : previous
      seen.set(chord, definition.id)
    }
  }
  return null
}

const withoutConflicts = (overrides: ShortcutOverrides): ShortcutOverrides => {
  const conflict = firstShortcutConflict(overrides)
  if (!conflict) return overrides
  const next = Object.fromEntries(Object.entries(overrides).filter(([id]) => id !== conflict))
  return withoutConflicts(next)
}

export const validatedShortcutOverrides = (value: unknown): ShortcutOverrides => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const valid: ShortcutOverrides = {}
  for (const [id, chord] of Object.entries(source)) {
    if (!isShortcutId(id)) continue
    if (
      chord === null ||
      (isValidShortcutChord(chord) &&
        platforms.every((platform) => !reservedShortcutChords(platform).has(chord)))
    )
      valid[id] = chord
  }
  // Validate the complete saved set: two commands may have exchanged defaults.
  return withoutConflicts(valid)
}

export const useShortcutPreferences = create<ShortcutPreferences>()(
  persist(
    (set, get) => ({
      overrides: {},
      setChord: (id, chord) => {
        const error = validateChange(id, chord, get().overrides)
        if (error) return error
        set((state) => ({ overrides: { ...state.overrides, [id]: chord } }))
        return null
      },
      restoreChord: (id) => {
        const overrides = Object.fromEntries(
          Object.entries(get().overrides).filter(([key]) => key !== id),
        ) as ShortcutOverrides
        for (const platform of platforms) {
          const chord = defaultShortcutChord(id, platform)
          if (
            shortcutDefinitions.some(
              (definition) =>
                definition.id !== id &&
                effectiveChord(definition.id, platform, overrides) === chord,
            )
          )
            return 'conflict'
        }
        set({ overrides })
        return null
      },
      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: 'brainstorming-shortcut-preferences',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ overrides }) => ({ overrides }),
      merge: (persisted, current) => {
        const stored = persisted as { overrides?: unknown } | null
        return { ...current, overrides: validatedShortcutOverrides(stored?.overrides) }
      },
    },
  ),
)

export const getShortcutChord = (
  id: ShortcutId,
  platform: DesktopPlatform,
  overrides: ShortcutOverrides = useShortcutPreferences.getState().overrides,
): string | null => effectiveChord(id, platform, overrides)
