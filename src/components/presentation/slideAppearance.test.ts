import { describe, expect, it } from 'vitest'
import { wcagContrast } from 'culori'
import { applyCommand, createDocument } from '@core'
import { slideAppearance } from '@renderer/components/presentation/slideAppearance'
import { mapPalettes } from '@shared/palettes'

describe('presentation document colors', () => {
  it.each(mapPalettes)('keeps body and secondary text readable for $id', ({ id }) => {
    const document = applyCommand(createDocument('Presentation'), {
      type: 'setDocumentSettings',
      settings: { theme: id },
    })
    const appearance = slideAppearance(document)
    const color = (name: string) => String(Reflect.get(appearance, name))
    expect(wcagContrast(color('--slide-fg'), color('--slide-bg'))).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(color('--slide-muted'), color('--slide-bg'))).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(color('--slide-cover-fg'), color('--slide-cover'))).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(
      wcagContrast(color('--slide-cover-muted'), color('--slide-cover')),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('honors custom backgrounds and fonts, including a light cover color', () => {
    const document = applyCommand(createDocument('Custom'), {
      type: 'setDocumentSettings',
      settings: {
        background: '#6f7680',
        fontFamily: 'Georgia',
        customPalette: {
          name: 'Custom',
          root: '#fffef9',
          background: '#ffffff',
          branches: ['#9a9a9a', '#9a9a9a', '#9a9a9a', '#9a9a9a', '#9a9a9a'],
        },
      },
    })
    const appearance = slideAppearance(document)
    expect(appearance.fontFamily).toBe('Georgia')
    expect(Reflect.get(appearance, '--slide-bg')).toBe('#6f7680')
    expect(
      wcagContrast(String(Reflect.get(appearance, '--slide-muted')), '#6f7680'),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      wcagContrast(String(Reflect.get(appearance, '--slide-cover-fg')), '#fffef9'),
    ).toBeGreaterThanOrEqual(4.5)
  })
})
