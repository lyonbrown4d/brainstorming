import { withPlainTitle } from '@core/extension-data'
import { getSubtreeIds, requireTopic } from '@core/tree'
import type { Command, MindMapDocument, MindMapWorkbook, Topic } from '@core/types'
import { validateTopicNotes } from '@core/topic-content'

export interface SearchOptions {
  readonly matchCase?: boolean
  readonly wholeWord?: boolean
  readonly includeNotes?: boolean
  readonly sheetId?: string
}

export interface DocumentSearchMatch {
  readonly topicId: string
  readonly field: 'title' | 'notes'
  readonly text: string
  readonly count: number
}

export interface SearchMatch extends DocumentSearchMatch {
  readonly sheetId: string
}

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

const matches = (text: string, query: string, options: SearchOptions): RegExpExecArray[] => {
  if (query.length === 0) return []
  const expression = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    options.matchCase ? 'gu' : 'giu',
  )
  const found = [...text.matchAll(expression)]
  if (!options.wholeWord) return found
  const starts = new Set<number>()
  const ends = new Set<number>()
  for (const part of wordSegmenter.segment(text)) {
    starts.add(part.index)
    ends.add(part.index + part.segment.length)
  }
  return found.filter((match) => starts.has(match.index) && ends.has(match.index + match[0].length))
}

/** Searches the complete tree, including descendants hidden by collapsed branches. */
export const searchDocument = (
  document: MindMapDocument,
  query: string,
  options: SearchOptions = {},
): DocumentSearchMatch[] => {
  const result: DocumentSearchMatch[] = []
  if (query.length === 0) return result
  for (const topicId of getSubtreeIds(document, document.rootId)) {
    const topic = requireTopic(document, topicId)
    const fields = options.includeNotes ? (['title', 'notes'] as const) : (['title'] as const)
    for (const field of fields) {
      const text = topic[field] ?? ''
      const count = matches(text, query, options).length
      if (count > 0) result.push({ topicId, field, text, count })
    }
  }
  return result
}

export const searchWorkbook = (
  workbook: MindMapWorkbook,
  query: string,
  options: SearchOptions = {},
): SearchMatch[] => {
  return workbook.sheets.flatMap((sheet) =>
    options.sheetId !== undefined && options.sheetId !== sheet.id
      ? []
      : searchDocument(sheet.document, query, options).map((match) => ({
          ...match,
          sheetId: sheet.id,
        })),
  )
}

const replaceText = (
  text: string,
  query: string,
  replacement: string,
  options: SearchOptions,
): string => {
  const found = matches(text, query, options)
  let result = ''
  let cursor = 0
  for (const match of found) {
    result += text.slice(cursor, match.index) + replacement
    cursor = match.index + match[0].length
  }
  return found.length === 0 ? text : result + text.slice(cursor)
}

const assertReplaceField = (field: unknown): void => {
  if (field !== undefined && field !== 'title' && field !== 'notes') throw new Error('替换字段无效')
}

export const replaceTopicText = (
  document: MindMapDocument,
  topic: Topic,
  command: Extract<Command, { type: 'replaceTopicText' }>,
): MindMapDocument => {
  if (typeof command.query !== 'string' || command.query.length === 0)
    throw new Error('查找文本不能为空')
  if (typeof command.replacement !== 'string') throw new Error('替换内容必须是文本')
  assertReplaceField(command.field)
  const title =
    command.field === 'notes'
      ? topic.title
      : replaceText(topic.title, command.query, command.replacement, command)
  const notes =
    (command.field === 'notes' || (command.field === undefined && command.includeNotes)) &&
    topic.notes !== undefined
      ? replaceText(topic.notes, command.query, command.replacement, command)
      : topic.notes
  if (notes !== undefined) validateTopicNotes(notes)
  if (title === topic.title && notes === topic.notes) return document
  return {
    ...document,
    title: topic.id === document.rootId ? title : document.title,
    topics: {
      ...document.topics,
      [topic.id]: { ...withPlainTitle(topic, title), ...(notes === undefined ? {} : { notes }) },
    },
  }
}
