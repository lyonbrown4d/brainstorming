import { fromMarkdown } from 'mdast-util-from-markdown'
import type { MindMapWorkbook } from '../../core'
import { validateBoundedWorkbook } from '../trelyx/validation'
import { assertTextSize, outlineWorkbook, type OutlineSheet, type OutlineTopic } from './outline'

interface MarkdownNode {
  type: string
  value?: string
  children?: MarkdownNode[]
  depth?: number
}
function plain(node: MarkdownNode): string {
  if (node.type === 'break') return '\n'
  if (node.type === 'html') return node.value ?? ''
  if (node.value !== undefined) return node.value
  return (node.children ?? [])
    .filter((child) => child.type !== 'list')
    .map(plain)
    .join('')
}
function listTopics(node: MarkdownNode, depth = 1): OutlineTopic[] {
  if (depth > 128) throw new Error('大纲超过 128 层')
  return (node.children ?? []).map((item) => {
    const paragraphs = (item.children ?? []).filter((child) => child.type !== 'list')
    return {
      title: paragraphs.map(plain).join('\n'),
      children: (item.children ?? [])
        .filter((child) => child.type === 'list')
        .flatMap((child) => listTopics(child, depth + 1)),
    }
  })
}
/** CommonMark is parsed to plain topic titles; raw HTML never executes. */
export function decodeMarkdown(text: string): MindMapWorkbook {
  assertTextSize(text)
  const ast: MarkdownNode = fromMarkdown(text)
  const sheets: OutlineSheet[] = []
  let name = '导入大纲'
  let roots: OutlineTopic[] = []
  const flush = () => {
    if (!roots.length) return
    const root = roots.length === 1 ? roots[0] : { title: name, children: roots }
    if (root) sheets.push({ name, root })
    roots = []
  }
  const headings: { depth: number; topic: OutlineTopic }[] = []
  for (const node of ast.children ?? []) {
    if (node.type === 'heading' && node.depth === 1) {
      flush()
      name = plain(node) || '导入大纲'
      headings.length = 0
    } else if (node.type === 'list') {
      const topics = listTopics(node)
      const parent = headings.at(-1)?.topic
      if (parent) parent.children.push(...topics)
      else roots.push(...topics)
    } else if (node.type === 'heading') {
      const topic: OutlineTopic = { title: plain(node), children: [] }
      while (headings.length && (headings.at(-1)?.depth ?? 0) >= (node.depth ?? 2)) headings.pop()
      const parent = headings.at(-1)?.topic
      if (parent) parent.children.push(topic)
      else roots.push(topic)
      headings.push({ depth: node.depth ?? 2, topic })
    } else if (node.type === 'paragraph' || node.type === 'code') {
      roots.push({ title: plain(node), children: [] })
    }
  }
  flush()
  if (!sheets.length && text.trim()) sheets.push({ name, root: { title: name, children: [] } })
  return outlineWorkbook(sheets)
}
const escape = (value: string) => value.replace(/[\\`*_[\]<>#!|~+().&-]/g, '\\$&')
export function encodeMarkdown(workbook: MindMapWorkbook): string {
  validateBoundedWorkbook(workbook)
  return (
    workbook.sheets
      .map((sheet) => {
        const lines = [`# ${escape(sheet.name).replaceAll('\n', ' ')}`, '']
        const visit = (id: string, depth: number) => {
          const topic = sheet.document.topics[id]
          if (!topic) return
          const indent = '  '.repeat(depth)
          const title = escape(topic.title).split('\n').join(`\\\n${indent}  `)
          lines.push(`${indent}- ${title}`)
          for (const child of topic.children) visit(child, depth + 1)
        }
        visit(sheet.document.rootId, 0)
        return lines.join('\n')
      })
      .join('\n\n') + '\n'
  )
}
export function encodeText(workbook: MindMapWorkbook): string {
  validateBoundedWorkbook(workbook)
  return (
    workbook.sheets
      .map((sheet) => {
        const lines = [sheet.name]
        const visit = (id: string, depth: number) => {
          const topic = sheet.document.topics[id]
          if (!topic) return
          lines.push(`${'  '.repeat(depth)}${topic.title.replaceAll('\n', '\\n')}`)
          for (const child of topic.children) visit(child, depth + 1)
        }
        visit(sheet.document.rootId, 0)
        return lines.join('\n')
      })
      .join('\n\n') + '\n'
  )
}
