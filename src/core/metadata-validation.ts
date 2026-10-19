import {
  LAYOUT_KINDS,
  type TopicMetadata,
  type DocumentSettings,
  type LayoutKind,
} from '@core/extensions'
import * as v from '@core/extension-validation'
import { assertId } from '@core/validation'
import { assertAssetId } from '@core/topic-content'
export const validateLayoutKind: (value: unknown) => asserts value is LayoutKind = (
  value: unknown,
) => {
  v.oneOf(value, LAYOUT_KINDS)
}
const strings = (value: unknown, maximum: number): void => {
  const entries = v.list(value, maximum)
  for (const entry of entries) v.text(entry, 64)
  if (new Set(entries).size !== entries.length) throw new Error('标签或图标重复')
}
const validateLink = (value: unknown): void => {
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
const validateTask = (value: unknown): void => {
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
export const validateTopicMetadata: (value: unknown) => asserts value is TopicMetadata = (
  value: unknown,
) => {
  const metadata = v.record(value, [
    'labels',
    'markers',
    'markerStyle',
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
  v.optional(metadata, 'markerStyle', (entry) => {
    const style = v.record(entry, ['position', 'size'])
    v.optional(style, 'position', (position) => {
      v.oneOf(position, ['top', 'bottom', 'left', 'right'])
    })
    v.optional(style, 'size', (size) => {
      v.number(size, 12, 48)
      if (!Number.isInteger(size)) throw new Error('图标尺寸须为整数')
    })
  })
  v.optional(metadata, 'link', validateLink)
  v.optional(metadata, 'task', validateTask)
  v.optional(metadata, 'equation', (entry) => {
    v.text(entry, 10000, true)
  })
  v.optional(metadata, 'audioAssetId', assertAssetId)
  v.optional(metadata, 'notesFormat', (entry) => {
    v.oneOf(entry, ['plain', 'markdown'])
  })
  v.optional(metadata, 'richTitle', (entry) => {
    v.text(entry, 100000, true)
  })
}
export const validateDocumentSettings: (value: unknown) => asserts value is DocumentSettings = (
  value: unknown,
) => {
  const settings = v.record(value, [
    'layout',
    'visualStyle',
    'theme',
    'customPalette',
    'background',
    'fontFamily',
    'lineWidth',
  ])
  v.optional(settings, 'layout', validateLayoutKind)
  v.optional(settings, 'visualStyle', (entry) => {
    v.oneOf(entry, ['normal', 'sketch'])
  })
  v.optional(settings, 'theme', (entry) => {
    v.oneOf(entry, ['brainstorming', 'ocean', 'forest', 'sunset', 'mono', 'dawn', 'paper', 'night'])
  })
  v.optional(settings, 'customPalette', (entry) => {
    const palette = v.record(entry, ['name', 'root', 'branches', 'background'])
    v.text(palette.name, 40)
    v.color(palette.root)
    v.color(palette.background)
    for (const branch of v.list(palette.branches, 5, 5)) v.color(branch)
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
