import { type MindMapDocument } from '@core'

import { findPalette, paletteAppearance, readableText } from '@shared/palettes'

const resolveDocumentAppearance = (document: MindMapDocument) => {
  const selected = document.settings?.customPalette ?? findPalette(document.settings?.theme)
  const theme = paletteAppearance({
    ...selected,
    background: document.settings?.background ?? selected.background,
  })
  return {
    ...theme,
    fontFamily: document.settings?.fontFamily ?? 'system-ui, sans-serif',
    lineWidth: document.settings?.lineWidth,
  }
}
const documentAppearances = new WeakMap<
  MindMapDocument,
  ReturnType<typeof resolveDocumentAppearance>
>()
export const documentAppearance = (document: MindMapDocument) => {
  const cached = documentAppearances.get(document)
  if (cached) return cached
  const appearance = resolveDocumentAppearance(document)
  documentAppearances.set(document, appearance)
  return appearance
}
export interface TopicAppearance {
  readonly fill: string
  readonly color: string
  readonly stroke: string
  readonly fontFamily: string
  readonly lineWidth: number
}
const appearances = new WeakMap<MindMapDocument, ReadonlyMap<string, TopicAppearance>>()
export const topicAppearance = (document: MindMapDocument, topicId: string): TopicAppearance => {
  let cached = appearances.get(document)
  const palette = documentAppearance(document)
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
      values.set(item.id, {
        fill:
          topic.style?.fill ??
          (root
            ? palette.root
            : item.depth === 1
              ? (palette.fills[index] ?? palette.background)
              : palette.background),
        color:
          topic.style?.color ??
          readableText(
            topic.style?.fill ??
              (root
                ? palette.root
                : item.depth === 1
                  ? (palette.fills[index] ?? palette.background)
                  : palette.background),
          ),
        stroke: palette.branches[index] ?? palette.root,
        fontFamily: palette.fontFamily,
        lineWidth: topic.style?.lineWidth ?? palette.lineWidth ?? (item.depth === 1 ? 3 : 2),
      })
      topic.children.forEach((id, childIndex) => {
        pending.push({ id, index: root ? childIndex : item.index, depth: item.depth + 1 })
      })
    }
    cached = values
    appearances.set(document, cached)
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
