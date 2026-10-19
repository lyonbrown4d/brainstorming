import type { DesktopPlatform } from '@shared/window'

const codeForKey = (event: Pick<KeyboardEvent, 'code' | 'key'>): string | null => {
  const code = event.code
  if (/^Key[A-Z]$|^Digit[0-9]$|^F(?:[1-9]|1[0-2])$/.test(code)) return code
  if (['Slash', 'Equal', 'Minus', 'Comma', 'Enter', 'Backspace', 'Delete'].includes(code))
    return code
  const key = event.key.toLowerCase()
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return (
    (
      {
        '/': 'Slash',
        '?': 'Slash',
        '=': 'Equal',
        '+': 'Equal',
        '-': 'Minus',
        ',': 'Comma',
        enter: 'Enter',
        backspace: 'Backspace',
        delete: 'Delete',
      } as Record<string, string>
    )[key] ?? (/^f(?:[1-9]|1[0-2])$/.test(key) ? key.toUpperCase() : null)
  )
}

export const chordFromEvent = (
  event: Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  platform: DesktopPlatform,
): string | null => {
  const mac = platform === 'macos' || platform === 'ios'
  const primary = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if ((event.metaKey || event.ctrlKey) && !primary) return null
  const code = codeForKey(event)
  if (!code) return null
  return `${primary ? 'Mod+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.altKey ? 'Alt+' : ''}${code}`
}

export const isValidShortcutChord = (chord: unknown): chord is string => {
  if (typeof chord !== 'string') return false
  const match =
    /^(Mod\+)?(Shift\+)?(Alt\+)?(Key[A-Z]|Digit[0-9]|Slash|Equal|Minus|Comma|F(?:[1-9]|1[0-2]))$/.exec(
      chord,
    )
  if (!match) return false
  return !!match[1] || match[4]?.startsWith('F') === true
}

export const formatShortcutChord = (chord: string | null, platform: DesktopPlatform): string => {
  if (!chord) return '—'
  const mac = platform === 'macos' || platform === 'ios'
  const names: Record<string, string> = {
    Mod: mac ? '⌘' : 'Ctrl',
    Shift: mac ? '⇧' : 'Shift',
    Alt: mac ? '⌥' : 'Alt',
    Slash: '/',
    Equal: '+',
    Minus: '−',
    Comma: ',',
    Digit0: '0',
  }
  return chord
    .split('+')
    .map((part) => names[part] ?? part.replace(/^Key|^Digit/, ''))
    .join(mac ? '' : ' + ')
}
