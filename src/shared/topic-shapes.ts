import type { TopicShape } from '@core/types'

/** Insets keep all existing topic content inside the decorative silhouette. */
export const topicShapeInsets = (shape: TopicShape = 'rounded') => {
  switch (shape) {
    case 'ellipse':
    case 'circle':
      return { x: 0.15, y: 0.15 }
    case 'diamond':
      return { x: 0.25, y: 0.25 }
    case 'hexagon':
    case 'tag':
      return { x: 0.16, y: 0.04 }
    case 'cloud':
      return { x: 0.16, y: 0.18 }
    case 'speech':
      return { x: 0.04, y: 0.18 }
    case 'bookmark':
      return { x: 0.04, y: 0.16 }
    case 'flag':
      return { x: 0.14, y: 0.04 }
    default:
      return { x: 0, y: 0 }
  }
}

/** SVG paths are shared by the live canvas and SVG, PNG and PDF exports. */
export const topicShapePath = (shape: TopicShape, width = 100, height = 100): string => {
  const point = (x: number, y: number) => `${(x * width) / 100} ${(y * height) / 100}`
  const polygon = (points: readonly (readonly [number, number])[]) =>
    `M${points.map(([x, y]) => point(x, y)).join(' L')} Z`
  switch (shape) {
    case 'diamond':
      return polygon([
        [50, 0],
        [100, 50],
        [50, 100],
        [0, 50],
      ])
    case 'hexagon':
      return polygon([
        [16, 0],
        [84, 0],
        [100, 50],
        [84, 100],
        [16, 100],
        [0, 50],
      ])
    case 'tag':
      return polygon([
        [0, 0],
        [84, 0],
        [100, 50],
        [84, 100],
        [0, 100],
      ])
    case 'flag':
      return polygon([
        [0, 0],
        [100, 0],
        [86, 50],
        [100, 100],
        [0, 100],
      ])
    case 'bookmark':
      return polygon([
        [0, 0],
        [100, 0],
        [100, 100],
        [50, 84],
        [0, 100],
      ])
    case 'speech':
      return polygon([
        [0, 0],
        [100, 0],
        [100, 82],
        [34, 82],
        [16, 100],
        [20, 82],
        [0, 82],
      ])
    case 'sticky':
      return polygon([
        [0, 0],
        [100, 0],
        [100, 84],
        [84, 100],
        [0, 100],
      ])
    case 'cloud':
      return `M${point(18, 80)} C${point(0, 84)} ${point(0, 40)} ${point(13, 36)} C${point(4, 6)} ${point(35, 0)} ${point(46, 15)} C${point(64, 0)} ${point(92, 3)} ${point(89, 29)} C${point(100, 28)} ${point(100, 67)} ${point(91, 72)} C${point(96, 100)} ${point(61, 100)} ${point(50, 87)} C${point(38, 100)} ${point(16, 100)} ${point(18, 80)} Z`
    default: {
      const radius =
        shape === 'rectangle'
          ? 0
          : shape === 'capsule'
            ? Math.min(width, height) / 2
            : Math.min(14, height / 4)
      return `M${radius} 0 H${width - radius} Q${width} 0 ${width} ${radius} V${height - radius} Q${width} ${height} ${width - radius} ${height} H${radius} Q0 ${height} 0 ${height - radius} V${radius} Q0 0 ${radius} 0 Z`
    }
  }
}

export const showsTopicNotes = (shape?: TopicShape): boolean =>
  shape === 'sticky' || shape === 'card'
export const topicNotesPreview = (notes: string): string =>
  Array.from(notes.replace(/\s+/g, ' ').trim()).slice(0, 160).join('')
