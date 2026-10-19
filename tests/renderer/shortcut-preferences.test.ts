import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExampleDocument } from '@core'
import { createStoryDesktop } from '@stories/desktopBridge'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { useEditor } from '@renderer/state/editor'
import { handleTopicShortcut } from '@renderer/state/editingShortcuts'
import { shortcutIdForEvent } from '@renderer/state/shortcutLookup'
import {
  getShortcutChord,
  useShortcutPreferences,
  validatedShortcutOverrides,
} from '@renderer/state/shortcutPreferences'
import { chordFromEvent } from '@renderer/state/shortcutMatching'

const key = (value: string, options: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({
    key: value,
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    preventDefault: vi.fn(),
    ...options,
  }) as KeyboardEvent
let restore: () => void
beforeEach(() => {
  restore = installPlatformAPI(createStoryDesktop())
  useShortcutPreferences.getState().resetAll()
  useEditor.getState().replace(createExampleDocument())
  useEditor.setState({ busy: false })
})
afterEach(() => {
  useShortcutPreferences.getState().resetAll()
  restore()
})

describe('custom shortcuts', () => {
  it('changes the actual map action and disables the displaced default', () => {
    useEditor.getState().select('vision')
    const custom = key('g', { metaKey: true, shiftKey: true })
    const old = key('r', { metaKey: true })
    expect(useShortcutPreferences.getState().setChord('root', 'Mod+Shift+KeyG')).toBeNull()
    expect(handleTopicShortcut(old)).toBe(false)
    expect(useEditor.getState().selectedId).toBe('vision')
    expect(handleTopicShortcut(custom)).toBe(true)
    expect(useEditor.getState().selectedId).toBe('root')
  })

  it('uses the same effective bindings for file commands', () => {
    const old = key('s', { metaKey: true })
    const custom = key('g', { metaKey: true, shiftKey: true })
    expect(shortcutIdForEvent(old, 'global')).toBe('save')
    expect(useShortcutPreferences.getState().setChord('save', 'Mod+Shift+KeyG')).toBeNull()
    expect(shortcutIdForEvent(old, 'global')).toBeNull()
    expect(shortcutIdForEvent(custom, 'global')).toBe('save')
    expect(useShortcutPreferences.getState().setChord('save', null)).toBeNull()
    expect(shortcutIdForEvent(custom, 'global')).toBeNull()
  })

  it('rejects fixed, unsafe, duplicate and cross-platform conflicting chords', () => {
    const state = useShortcutPreferences.getState()
    expect(state.setChord('root', 'KeyG')).toBe('invalid')
    expect(state.setChord('root', 'Mod+KeyC')).toBe('reserved')
    expect(state.setChord('root', 'Mod+KeyS')).toBe('conflict')
    expect(state.setChord('root', 'Mod+KeyY')).toBe('conflict') // Windows redo
    expect(getShortcutChord('root', 'macos')).toBe('Mod+KeyR')
  })

  it('distinguishes explicit clearing from reset and guards restore conflicts', () => {
    const state = useShortcutPreferences.getState()
    expect(state.setChord('root', null)).toBeNull()
    expect(getShortcutChord('root', 'macos')).toBeNull()
    expect(state.setChord('save', 'Mod+KeyR')).toBeNull()
    expect(state.restoreChord('root')).toBe('conflict')
    expect(getShortcutChord('root', 'macos')).toBeNull()
    state.resetAll()
    expect(getShortcutChord('root', 'macos')).toBe('Mod+KeyR')
    expect(getShortcutChord('save', 'macos')).toBe('Mod+KeyS')
  })

  it('discards malformed stored chords and platform conflicts without dropping safe entries', () => {
    expect(validatedShortcutOverrides({ save: 'Mod+KeyN', new: 'Mod+KeyS' })).toEqual({
      save: 'Mod+KeyN',
      new: 'Mod+KeyS',
    })
    expect(
      validatedShortcutOverrides({
        root: null,
        save: 'Mod+KeyR',
        new: 'Mod+KeyR',
        open: 'KeyO',
        unknown: 'Mod+KeyG',
      }),
    ).toEqual({ root: null, new: 'Mod+KeyR' })
  })

  it('drops Windows redo aliases after reassignment and consumes held custom keys once', () => {
    restore()
    restore = installPlatformAPI({ ...createStoryDesktop(), platform: 'windows' })
    expect(shortcutIdForEvent(key('z', { ctrlKey: true, shiftKey: true }), 'map')).toBe('redo')
    expect(useShortcutPreferences.getState().setChord('redo', 'Mod+Shift+KeyG')).toBeNull()
    expect(shortcutIdForEvent(key('z', { ctrlKey: true, shiftKey: true }), 'map')).toBeNull()
    expect(shortcutIdForEvent(key('y', { ctrlKey: true }), 'map')).toBeNull()
    useEditor.getState().select('vision')
    expect(useShortcutPreferences.getState().setChord('root', 'Mod+Shift+KeyH')).toBeNull()
    expect(handleTopicShortcut(key('h', { ctrlKey: true, shiftKey: true, repeat: true }))).toBe(
      true,
    )
    expect(useEditor.getState().selectedId).toBe('vision')
  })

  it('keeps primary modifiers distinct and respects IME composition', () => {
    const macControl = key('r', { ctrlKey: true })
    expect(chordFromEvent(macControl, 'macos')).toBeNull()
    expect(shortcutIdForEvent(macControl, 'map')).toBeNull()
    const composing = key('r', { metaKey: true, isComposing: true })
    expect(handleTopicShortcut(composing)).toBe(false)
    expect(useEditor.getState().selectedId).toBe('root')
  })
})
