/** Deterministic estimates shared by layout and renderer; no browser measurements enter the document. */
export function measureTopic(
  title: string,
  isRoot = false,
  customFontSize?: number,
): { width: number; height: number } {
  const fontSize = customFontSize ?? (isRoot ? 24 : 16)
  // Include the renderer's padding, borders, and a small font-metric tolerance.
  const padding = isRoot ? 56 : 44
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
    height: Math.max(isRoot ? 64 : 44, lines * Math.ceil(fontSize * 1.5) + (isRoot ? 28 : 20)),
  }
}
