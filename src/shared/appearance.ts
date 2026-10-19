import { type MindMapDocument } from '@core'

import { findPalette, paletteAppearance, readableText } from '@shared/palettes'

/** A UI canvas color is a view projection; explicit document colors always win. */
export const canvasBackground = (document: MindMapDocument, surface?: string): string => {
  const settings = document.settings
  const selected = settings?.customPalette ?? findPalette(settings?.theme)
  if (settings?.background !== undefined) return settings.background
  if (settings?.customPalette || (settings?.theme && settings.theme !== 'brainstorming'))
    return selected.background
  return surface ?? selected.background
}

const resolveDocumentAppearance = (document: MindMapDocument, surface?: string) => {
  const selected = document.settings?.customPalette ?? findPalette(document.settings?.theme)
  const theme = paletteAppearance({
    ...selected,
    background: canvasBackground(document, surface),
  })
  return {
    ...theme,
    fontFamily: document.settings?.fontFamily ?? 'system-ui, sans-serif',
    lineWidth: document.settings?.lineWidth,
  }
}
const documentAppearances = new WeakMap<
  MindMapDocument,
  Map<string, ReturnType<typeof resolveDocumentAppearance>>
>()
export const documentAppearance = (document: MindMapDocument, surface?: string) => {
  const key = canvasBackground(document, surface)
  let variants = documentAppearances.get(document)
  if (!variants) {
    variants = new Map()
    documentAppearances.set(document, variants)
  }
  const cached = variants.get(key)
  if (cached) return cached
  const appearance = resolveDocumentAppearance(document, surface)
  variants.set(key, appearance)
  return appearance
}
export interface TopicAppearance {
  readonly fill: string
  readonly color: string
  readonly stroke: string
  readonly fontFamily: string
  readonly lineWidth: number
}
const appearances = new WeakMap<
  MindMapDocument,
  Map<string, ReadonlyMap<string, TopicAppearance>>
>()
export const topicAppearance = (
  document: MindMapDocument,
  topicId: string,
  surface?: string,
): TopicAppearance => {
  const palette = documentAppearance(document, surface)
  let variants = appearances.get(document)
  if (!variants) {
    variants = new Map()
    appearances.set(document, variants)
  }
  let cached = variants.get(palette.background)
  if (!cached) {
    const values = new Map<string, TopicAppearance>()
    const pending = [
      { id: document.rootId, index: 0, depth: 0 },
      ...(document.floatingIds ?? []).map((id, index) => ({ id, index, depth: 1 })),
    ]
    while (pending.length) {
      const item = pending.pop()
      if (!item) break
      const topic = document.topics[item.id]
      if (!topic || values.has(item.id)) continue
      const root = item.id === document.rootId
      const index = item.index % palette.branches.length
      const fill =
        topic.style?.shape === 'text'
          ? palette.background
          : (topic.style?.fill ??
            (topic.style?.shape === 'sticky'
              ? '#fff1a8'
              : root
                ? palette.root
                : item.depth === 1
                  ? (palette.fills[index] ?? palette.background)
                  : palette.background))
      values.set(item.id, {
        fill,
        color: topic.style?.color ?? readableText(fill),
        stroke: palette.branches[index] ?? palette.root,
        fontFamily: palette.fontFamily,
        lineWidth: topic.style?.lineWidth ?? palette.lineWidth ?? (item.depth === 1 ? 3 : 2),
      })
      topic.children.forEach((id, childIndex) => {
        pending.push({ id, index: root ? childIndex : item.index, depth: item.depth + 1 })
      })
    }
    cached = values
    variants.set(palette.background, cached)
  }
  return (
    cached.get(topicId) ?? {
      fill: palette.background,
      color: palette.text,
      stroke: palette.root,
      fontFamily: palette.fontFamily,
      lineWidth: palette.lineWidth ?? 2,
    }
  )
}
