import type { CSSProperties } from 'react'
import type { LayoutKind } from '@core'
import { findPalette, type PaletteId } from '@shared/palettes'

interface StructureStyle extends CSSProperties {
  '--structure-color': string
  '--structure-branch-0': string
  '--structure-branch-1': string
  '--structure-branch-2': string
  '--structure-branch-3': string
  '--structure-branch-4': string
}

const palettes: Record<LayoutKind, PaletteId> = {
  map: 'brainstorming',
  'logic-right': 'ocean',
  'logic-left': 'ocean',
  'org-down': 'paper',
  'org-up': 'paper',
  'tree-down': 'forest',
  'tree-up': 'forest',
  'brace-right': 'dawn',
  'brace-left': 'dawn',
  fishbone: 'sunset',
  timeline: 'sunset',
  'timeline-vertical': 'sunset',
  matrix: 'ocean',
  'tree-table-right': 'paper',
  'tree-table-down': 'paper',
}

/** Gallery illustrations reuse document palettes; choosing a structure never changes document colors. */
export const structureAppearance = (kind: LayoutKind): StructureStyle => {
  const palette = findPalette(palettes[kind])
  return {
    '--structure-color': `color-mix(in srgb, ${palette.root} 75%, var(--ui-foreground))`,
    '--structure-branch-0': palette.branches[0],
    '--structure-branch-1': palette.branches[1],
    '--structure-branch-2': palette.branches[2],
    '--structure-branch-3': palette.branches[3],
    '--structure-branch-4': palette.branches[4],
  }
}
