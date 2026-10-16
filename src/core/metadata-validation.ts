import {
  LAYOUT_KINDS,
  type TopicMetadata,
  type DocumentSettings,
  type LayoutKind,
} from './extensions'
import * as v from './extension-validation'
import { assertId } from './validation'
import { assertAssetId } from './topic-content'

export function validateLayoutKind(value: unknown): asserts value is LayoutKind {
  v.oneOf(value, LAYOUT_KINDS)
}
function strings(value: unknown, maximum: number): void {
  const entries = v.list(value, maximum)
  for (const entry of entries) v.text(entry, 64)
  if (new Set(entries).size !== entries.length) throw new Error('标签或图标重复')
}
function validateLink(value: unknown): void {
  const link = v.record(value)
  if (link.kind === 'url') {
    v.record(value, ['kind', 'url'])
    v.text(link.url, 2048)
    if (/[\p{Cc}]/u.test(link.url)) throw new Error('链接包含控制字符')
    let parsed: URL
    try {
      parsed = new URL(link.url)
    } catch {
      throw new Error('链接地址无效')
    }
    if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol))
      throw new Error('链接仅支持 HTTP、HTTPS 或邮件地址')
  } else {
    v.record(value, ['kind', 'topicId', 'sheetId'])
    v.oneOf(link.kind, ['topic'])
    assertId(link.topicId)
    v.optional(link, 'sheetId', assertId)
  }
}
function validateTask(value: unknown): void {
  const task = v.record(value, [
    'done',
    'priority',
    'progress',
    'start',
    'due',
    'assignee',
    'dependencies',
  ])
  v.boolean(task.done)
  v.optional(task, 'priority', (entry) => {
    v.oneOf(entry, [1, 2, 3])
  })
  v.optional(task, 'progress', (entry) => {
    v.number(entry, 0, 100)
    if (!Number.isInteger(entry)) throw new Error('任务进度须为整数')
  })
  v.optional(task, 'start', v.date)
  v.optional(task, 'due', v.date)
  if (typeof task.start === 'string' && typeof task.due === 'string' && task.start > task.due)
    throw new Error('任务截止日期不能早于开始日期')
  v.optional(task, 'assignee', (entry) => {
    v.text(entry, 120)
  })
  v.optional(task, 'dependencies', (entry) => {
    v.ids(entry, 128)
  })
}
export function validateTopicMetadata(value: unknown): asserts value is TopicMetadata {
  const metadata = v.record(value, [
    'labels',
    'markers',
    'link',
    'task',
    'equation',
    'audioAssetId',
    'notesFormat',
    'richTitle',
  ])
  v.optional(metadata, 'labels', (entry) => {
    strings(entry, 32)
  })
  v.optional(metadata, 'markers', (entry) => {
    strings(entry, 32)
  })
  v.optional(metadata, 'link', validateLink)
  v.optional(metadata, 'task', validateTask)
  v.optional(metadata, 'equation', (entry) => {
    v.text(entry, 10_000, true)
  })
  v.optional(metadata, 'audioAssetId', assertAssetId)
  v.optional(metadata, 'notesFormat', (entry) => {
    v.oneOf(entry, ['plain', 'markdown'])
  })
  v.optional(metadata, 'richTitle', (entry) => {
    v.text(entry, 100_000, true)
  })
}
export function validateDocumentSettings(value: unknown): asserts value is DocumentSettings {
  const settings = v.record(value, ['layout', 'theme', 'background', 'fontFamily', 'lineWidth'])
  v.optional(settings, 'layout', validateLayoutKind)
  v.optional(settings, 'theme', (entry) => {
    v.oneOf(entry, ['trelyx', 'ocean', 'forest', 'sunset', 'mono'])
  })
  v.optional(settings, 'background', v.color)
  v.optional(settings, 'fontFamily', (entry) => {
    v.text(entry, 128)
    if (/[\p{Cc}]/u.test(entry)) throw new Error('字体名称无效')
  })
  v.optional(settings, 'lineWidth', (entry) => {
    v.number(entry, 1, 6)
  })
}
