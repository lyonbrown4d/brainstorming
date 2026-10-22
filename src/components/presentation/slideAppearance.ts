import type { CSSProperties } from 'react'
import { formatHex, interpolate, wcagContrast } from 'culori'
import type { MindMapDocument, PresentationStep, PresentationTextStyle } from '@core'
import { documentAppearance } from '@shared/appearance'
import { readableText } from '@shared/palettes'

const mix = (from: string, to: string, amount: number): string =>
  formatHex(interpolate([from, to], 'rgb')(amount))

/** Presentation colors belong to the document, not the surrounding application's theme. */
export const slideAppearance = (
  document: MindMapDocument,
  step?: PresentationStep,
): CSSProperties => {
  const palette = documentAppearance(document)
  const background = step?.appearance?.background ?? palette.background
  const foreground = readableText(background)
  const cover = step?.appearance?.background ?? palette.root
  const coverForeground = readableText(cover)
  const muted = mix(foreground, background, 0.3)
  const coverMuted = mix(coverForeground, cover, 0.25)
  return {
    fontFamily: palette.fontFamily,
    '--slide-bg': background,
    '--slide-fg': foreground,
    '--slide-muted': wcagContrast(muted, background) >= 4.5 ? muted : foreground,
    '--slide-line': mix(background, foreground, 0.16),
    '--slide-cover': cover,
    '--slide-cover-fg': coverForeground,
    '--slide-cover-muted': wcagContrast(coverMuted, cover) >= 4.5 ? coverMuted : coverForeground,
  } as CSSProperties
}

export const slideTextAppearance = (
  value?: PresentationTextStyle,
  baseSize?: number,
): CSSProperties => ({
  color: value?.color,
  fontWeight: value?.bold === undefined ? undefined : value.bold ? 600 : 400,
  textAlign: value?.align,
  ...(baseSize === undefined ? {} : { fontSize: `${baseSize * (value?.scale ?? 1)}cqw` }),
})
