import { translate } from '@renderer/i18n'
const EXTENSION = '.trelyx'
const MAX_FILE_NAME_BYTES = 160
const encoder = new TextEncoder()

/** Keep document titles intact while offering a portable, bounded file name. */
export const suggestedFileName = (title: string): string => {
  const sanitized = Array.from(title.normalize('NFC'), (character) => {
    const code = character.codePointAt(0) ?? 0
    return code < 32 || code === 127 || /[<>:"/\\|?*]/u.test(character) ? '-' : character
  })
    .join('')
    .trim()
    .replace(/^\.+|[. ]+$/gu, '')
  const portable = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(sanitized)
    ? `_${sanitized}`
    : sanitized
  const budget = MAX_FILE_NAME_BYTES - encoder.encode(EXTENSION).byteLength
  let result = ''
  let bytes = 0
  for (const character of portable || translate('untitledMap')) {
    const length = encoder.encode(character).byteLength
    if (bytes + length > budget) break
    result += character
    bytes += length
  }
  return `${result.trimEnd().replace(/[. ]+$/gu, '') || translate('untitledMap')}${EXTENSION}`
}
