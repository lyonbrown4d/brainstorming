import { LRUCache } from 'lru-cache'
import { formatHex, interpolate, wcagContrast } from 'culori'
import type { DocumentPalette, DocumentSettings } from '@core/extensions'

export type PaletteId = NonNullable<DocumentSettings['theme']>
export interface MapPalette extends DocumentPalette {
  readonly id: PaletteId
}
export const mapPalettes = [
  {
    id: 'brainstorming',
    name: 'Brainstorming',
    root: '#41464f',
    background: '#f7f7f2',
    branches: ['#d87578', '#399f91', '#c8953d', '#5c86c6', '#9784c6'],
  },
  {
    id: 'ocean',
    name: '海洋',
    root: '#276a91',
    background: '#f4faff',
    branches: ['#358ac0', '#279c98', '#557bc1', '#5e9bb8', '#6589ad'],
  },
  {
    id: 'forest',
    name: '森林',
    root: '#397851',
    background: '#f6faf4',
    branches: ['#5c9568', '#879b4b', '#6d9a81', '#969c54', '#5c938f'],
  },
  {
    id: 'sunset',
    name: '落日',
    root: '#ae5e56',
    background: '#fff8f3',
    branches: ['#ce7864', '#c99443', '#b8778f', '#cb925b', '#a584a5'],
  },
  {
    id: 'mono',
    name: '灰阶',
    root: '#41444c',
    background: '#fafafa',
    branches: ['#6c7079', '#93969d', '#777b86', '#a0a3aa', '#606570'],
  },
  {
    id: 'dawn',
    name: '晨光',
    root: '#aa7527',
    background: '#fffdf7',
    branches: ['#d6a64e', '#629cb7', '#cb8572', '#7da67a', '#a58bc1'],
  },
  {
    id: 'paper',
    name: '纸墨',
    root: '#303b50',
    background: '#fffef9',
    branches: ['#bb7462', '#728c70', '#b28b46', '#63859a', '#9286a4'],
  },
  {
    id: 'night',
    name: '夜航',
    root: '#7464c4',
    background: '#191c22',
    branches: ['#ca8f9f', '#83b8a4', '#d9ba7d', '#87abcf', '#ad9bd8'],
  },
] as const satisfies readonly MapPalette[]
const textColors = new LRUCache<string, string>({ max: 256 })

/** Palettes repeat a small set of fills across thousands of cards. */
export const readableText = (background: string): string => {
  const cached = textColors.get(background)
  if (cached) return cached
  const color =
    wcagContrast(background, '#242731') >= 4.5
      ? '#242731'
      : wcagContrast(background, '#ffffff') >= wcagContrast(background, '#000000')
        ? '#ffffff'
        : '#000000'
  textColors.set(background, color)
  return color
}

/** Resolve to portable hex colors for the canvas and standalone exports. */
export const paletteAppearance = (palette: DocumentPalette) => ({
  ...palette,
  text: readableText(palette.background),
  rootText: readableText(palette.root),
  grid: formatHex(interpolate([palette.background, readableText(palette.background)], 'rgb')(0.14)),
  fills: palette.branches.map((branch) =>
    formatHex(interpolate([branch, palette.background], 'rgb')(0.78)),
  ),
})
export const findPalette = (id: PaletteId = 'brainstorming'): MapPalette =>
  mapPalettes.find((palette) => palette.id === id) ?? mapPalettes[0]
