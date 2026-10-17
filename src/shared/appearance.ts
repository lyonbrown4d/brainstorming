import { type MindMapDocument } from '@core'

const themes = {
  trelyx: {
    root: '#7666c4',
    background: '#fcfcfa',
    text: '#30313b',
    branches: ['#e4878d', '#69b39e', '#e2ae54', '#9788d3', '#85a8c4'],
    fills: ['#ffc7c7', '#bcecdf', '#ffe0a3', '#d9d3fa', '#d2e4f3'],
  },
  ocean: {
    root: '#276a91',
    background: '#f4faff',
    text: '#17364a',
    branches: ['#358ac0', '#43aaa6', '#557bc1', '#5e9bb8', '#6589ad'],
    fills: ['#c9e7fb', '#c8eeeb', '#d7e1fb', '#d1eaf2', '#d9e5ef'],
  },
  forest: {
    root: '#397851',
    background: '#f6faf4',
    text: '#254333',
    branches: ['#5c9568', '#93a75d', '#6d9a81', '#a0a569', '#5c938f'],
    fills: ['#d2e8d4', '#e3ecc8', '#d5e9de', '#e7e9ce', '#d0e6e3'],
  },
  sunset: {
    root: '#ae5e56',
    background: '#fff8f3',
    text: '#5a3935',
    branches: ['#ce7864', '#deaa5e', '#b8778f', '#cb925b', '#a584a5'],
    fills: ['#f7d7ca', '#f9e8c8', '#eed4e0', '#f3dfc9', '#e8dcef'],
  },
  mono: {
    root: '#41444c',
    background: '#fafafa',
    text: '#292b30',
    branches: ['#6c7079', '#93969d', '#777b86', '#a0a3aa', '#606570'],
    fills: ['#e2e3e6', '#ededef', '#e5e6e9', '#f0f0f2', '#dcdfe4'],
  },
} as const
export const documentAppearance = (document: MindMapDocument) => {
  const theme = themes[document.settings?.theme ?? 'trelyx']
  return {
    ...theme,
    background: document.settings?.background ?? theme.background,
    fontFamily: document.settings?.fontFamily ?? 'system-ui, sans-serif',
    lineWidth: document.settings?.lineWidth,
  }
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
        color: topic.style?.color ?? (root ? '#ffffff' : palette.text),
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
