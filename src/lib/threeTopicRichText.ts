import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Topic } from '@core'

interface TitleNode {
  readonly type: string
  readonly value?: string
  readonly children?: readonly TitleNode[]
}
interface TitleStyle {
  readonly bold: boolean
  readonly italic: boolean
  readonly code: boolean
}
interface TitleRun extends TitleStyle {
  readonly text: string
  readonly start: number
  readonly end: number
}

/** Portable title formatting follows the same Markdown subset as RichTitleDisplay. */
export const threeTopicTitleRuns = (topic: Topic): readonly TitleRun[] => {
  const source = topic.metadata?.richTitle
  if (!source) return []
  const runs: TitleRun[] = []
  let offset = 0
  const visit = (node: TitleNode, style: TitleStyle) => {
    const next = {
      bold: style.bold || node.type === 'strong',
      italic: style.italic || node.type === 'emphasis',
      code: style.code || node.type === 'inlineCode',
    }
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'break') {
      const text = node.type === 'break' ? '\n' : (node.value ?? '')
      runs.push({ ...next, text, start: offset, end: offset + text.length })
      offset += text.length
    } else for (const child of node.children ?? []) visit(child, next)
  }
  visit(fromMarkdown(source), { bold: false, italic: false, code: false })
  return runs.map((run) => run.text).join('') === topic.title ? runs : []
}

export const paintThreeTopicTitleLine = (
  context: CanvasRenderingContext2D,
  line: string,
  offset: number,
  runs: ReturnType<typeof threeTopicTitleRuns>,
  centerX: number,
  y: number,
  width: number,
  fontSize: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
) => {
  if (!runs.length) {
    context.fillText(line, centerX, y, width)
    return
  }
  const parts = runs.flatMap((run) => {
    const start = Math.max(offset, run.start),
      end = Math.min(offset + line.length, run.end)
    return end > start ? [{ ...run, text: line.slice(start - offset, end - offset) }] : []
  })
  const font = (run: TitleStyle) =>
    `${italic || run.italic ? 'italic' : 'normal'} ${bold || run.bold ? '600' : '400'} ${fontSize}px ${run.code ? 'monospace' : fontFamily}`
  const total = parts.reduce((sum, part) => {
    context.font = font(part)
    return sum + context.measureText(part.text).width
  }, 0)
  context.save()
  context.textAlign = 'left'
  context.translate(centerX, y)
  context.scale(Math.min(1, width / Math.max(1, total)), 1)
  let x = -total / 2
  for (const part of parts) {
    context.font = font(part)
    context.fillText(part.text, x, 0)
    x += context.measureText(part.text).width
  }
  context.restore()
}
