/** Deterministic estimates shared by layout and renderer; no browser measurements enter the document. */
export function measureTopic(title: string, isRoot = false): { width: number; height: number } {
  const fontSize = isRoot ? 20 : 14
  const padding = isRoot ? 48 : 36
  const maxWidth = isRoot ? 280 : 240
  const maxTextWidth = maxWidth - padding
  let lineWidth = 0
  let longestLine = 0
  let lines = 1
  for (const character of title) {
    if (character === '\n') {
      longestLine = Math.max(longestLine, lineWidth)
      lineWidth = 0
      lines += 1
      continue
    }
    const width = (character.codePointAt(0) ?? 0) > 255 ? fontSize : fontSize * 0.62
    if (lineWidth + width > maxTextWidth && lineWidth > 0) {
      longestLine = Math.max(longestLine, lineWidth)
      lineWidth = 0
      lines += 1
    }
    lineWidth += width
  }
  longestLine = Math.max(longestLine, lineWidth)
  return {
    width: Math.max(isRoot ? 180 : 112, Math.min(maxWidth, Math.ceil(longestLine + padding))),
    height: Math.max(isRoot ? 64 : 44, lines * (isRoot ? 28 : 22) + (isRoot ? 28 : 20)),
  }
}
