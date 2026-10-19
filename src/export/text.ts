export const wrappedTitle = (title: string, fontSize: number, maxWidth: number): string[] => {
  const lines = ['']
  let width = 0
  for (const character of title) {
    const size = (character.codePointAt(0) ?? 0) > 255 ? fontSize : fontSize * 0.62
    if (character === '\n' || (width + size > maxWidth && width > 0)) {
      lines.push('')
      width = 0
    }
    if (character !== '\n') {
      lines[lines.length - 1] = (lines.at(-1) ?? '') + character
      width += size
    }
  }
  return lines
}
