/** XML 1.0 cannot encode control characters or lone UTF-16 surrogates. */
export function xmlText(value: string): string {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0
    if (
      (point < 32 && ![9, 10, 13].includes(point)) ||
      (point >= 0xd800 && point <= 0xdfff) ||
      point === 0xfffe ||
      point === 0xffff
    )
      throw new Error('文本包含 XML 无法表示的控制字符，请先删除这些字符')
  }
  return value
}
