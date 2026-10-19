import type { MessageKey } from '@renderer/i18n'
import type { DesktopPlatform } from '@shared/window'

export type ShortcutScope = 'global' | 'map'
export interface ShortcutDefinition {
  readonly id: string
  readonly label: MessageKey
  readonly group: MessageKey
  readonly scope: ShortcutScope
  readonly defaultChord: string
  readonly windowsChord?: string
  readonly macChord?: string
}

export const shortcutDefinitions = [
  {
    id: 'settings',
    label: 'applicationSettings',
    group: 'settingsShortcutFiles',
    scope: 'global',
    defaultChord: 'Mod+Comma',
  },
  {
    id: 'new',
    label: 'shortcutNewMap',
    group: 'settingsShortcutFiles',
    scope: 'global',
    defaultChord: 'Mod+KeyN',
  },
  {
    id: 'open',
    label: 'shortcutOpenMap',
    group: 'settingsShortcutFiles',
    scope: 'global',
    defaultChord: 'Mod+KeyO',
  },
  {
    id: 'save',
    label: 'shortcutSaveMap',
    group: 'settingsShortcutFiles',
    scope: 'global',
    defaultChord: 'Mod+KeyS',
  },
  {
    id: 'saveAs',
    label: 'shortcutSaveAsMap',
    group: 'settingsShortcutFiles',
    scope: 'global',
    defaultChord: 'Mod+Shift+KeyS',
  },
  {
    id: 'close',
    label: 'shortcutCloseMap',
    group: 'settingsShortcutFiles',
    scope: 'global',
    defaultChord: 'Mod+KeyW',
  },
  {
    id: 'undo',
    label: 'undo',
    group: 'settingsShortcutFiles',
    scope: 'map',
    defaultChord: 'Mod+KeyZ',
  },
  {
    id: 'redo',
    label: 'redo',
    group: 'settingsShortcutFiles',
    scope: 'map',
    defaultChord: 'Mod+Shift+KeyZ',
    windowsChord: 'Mod+KeyY',
  },
  {
    id: 'search',
    label: 'findAndReplace',
    group: 'settingsShortcutNavigation',
    scope: 'map',
    defaultChord: 'Mod+KeyF',
  },
  {
    id: 'root',
    label: 'goToCentralTopic',
    group: 'settingsShortcutNavigation',
    scope: 'map',
    defaultChord: 'Mod+KeyR',
  },
  {
    id: 'zoomIn',
    label: 'shortcutZoomIn',
    group: 'settingsShortcutNavigation',
    scope: 'map',
    defaultChord: 'Mod+Equal',
  },
  {
    id: 'zoomOut',
    label: 'shortcutZoomOut',
    group: 'settingsShortcutNavigation',
    scope: 'map',
    defaultChord: 'Mod+Minus',
  },
  {
    id: 'actualSize',
    label: 'shortcutActualSize',
    group: 'settingsShortcutNavigation',
    scope: 'map',
    defaultChord: 'Mod+Digit0',
  },
  {
    id: 'inspector',
    label: 'commandToggleProperties',
    group: 'settingsShortcutNavigation',
    scope: 'map',
    defaultChord: 'Mod+KeyI',
  },
  {
    id: 'presentation',
    label: 'presentationPlayFromStart',
    group: 'settingsShortcutNavigation',
    scope: 'map',
    defaultChord: 'F5',
  },
  {
    id: 'fold',
    label: 'shortcutFold',
    group: 'settingsShortcutEditing',
    scope: 'map',
    defaultChord: 'Mod+Slash',
  },
  {
    id: 'foldAll',
    label: 'shortcutFoldAll',
    group: 'settingsShortcutEditing',
    scope: 'map',
    defaultChord: 'Mod+Alt+Slash',
    macChord: 'Mod+Shift+Slash',
  },
  {
    id: 'duplicate',
    label: 'shortcutDuplicate',
    group: 'settingsShortcutEditing',
    scope: 'map',
    defaultChord: 'Mod+KeyD',
  },
] as const satisfies readonly ShortcutDefinition[]

export type ShortcutId = (typeof shortcutDefinitions)[number]['id']
export const isShortcutId = (id: string): id is ShortcutId =>
  shortcutDefinitions.some((definition) => definition.id === id)

export const defaultShortcutChord = (id: ShortcutId, platform: DesktopPlatform): string => {
  const definition = shortcutDefinitions.find((item) => item.id === id)
  if (!definition) throw new Error(`Unknown shortcut: ${id}`)
  const mac = platform === 'macos' || platform === 'ios'
  return (
    (mac
      ? 'macChord' in definition && definition.macChord
      : 'windowsChord' in definition && definition.windowsChord) || definition.defaultChord
  )
}

/** Chords still owned by the text editor, canvas, OS, or another fixed app handler. */
export const reservedShortcutChords = (platform: DesktopPlatform): ReadonlySet<string> => {
  const mac = platform === 'macos' || platform === 'ios'
  return new Set([
    'Mod+KeyA',
    'Mod+KeyC',
    'Mod+KeyX',
    'Mod+KeyV',
    'Mod+KeyK',
    'Mod+Enter',
    mac ? 'Mod+Backspace' : 'Mod+Delete',
    'Mod+Shift+KeyN',
    'Mod+Shift+KeyR',
    'Mod+Shift+KeyI',
    'Mod+Shift+KeyB',
    'Mod+Shift+KeyA',
    'Mod+Alt+KeyA',
    'Mod+KeyB',
    'Mod+KeyQ',
    'Mod+KeyL',
    'Mod+KeyT',
    'Mod+KeyP',
    'Mod+Shift+KeyP',
    'Mod+Shift+KeyO',
  ])
}
