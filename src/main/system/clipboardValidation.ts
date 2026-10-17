import { validateTopicClipboard } from '@core'

const PREFIX = 'Brainstorming topics v1\n'
const CLIPBOARD_LIMIT = 56 * 1024 * 1024

export const assertText: (value: unknown, limit: number) => asserts value is string = (
  value: unknown,
  limit: number,
): asserts value is string => {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > limit)
    throw new Error('文本内容无效或超过大小限制')
}

export const assertTopics: (value: unknown) => asserts value is string = (
  value: unknown,
): asserts value is string => {
  assertText(value, CLIPBOARD_LIMIT)
  if (!value.startsWith(PREFIX)) throw new Error('剪贴板主题格式无效')
  const parsed: unknown = JSON.parse(value.slice(PREFIX.length))
  validateTopicClipboard(parsed)
}
