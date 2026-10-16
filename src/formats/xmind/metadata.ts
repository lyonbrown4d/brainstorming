import type { TopicMetadata } from '../../core/extensions'
import { validateTopicMetadata } from '../../core/metadata-validation'
import type { SourceRecord, Warnings } from './common'

/** Standard XMind labels and safe URL links remain data; importing never opens a URL. */
export function standardMetadata(
  source: SourceRecord,
  warnings: Warnings,
): TopicMetadata | undefined {
  const metadata: { labels?: string[]; link?: { kind: 'url'; url: string } } = {}
  if (source.labels !== undefined) {
    if (
      Array.isArray(source.labels) &&
      source.labels.every((label): label is string => typeof label === 'string')
    )
      metadata.labels = source.labels
    else warnings.add('XMind 标签格式无效，已跳过')
  }
  if (typeof source.href === 'string' && /^(?:https?:|mailto:)/i.test(source.href))
    metadata.link = { kind: 'url', url: source.href }
  if (!Object.keys(metadata).length) return undefined
  try {
    validateTopicMetadata(metadata)
    return metadata
  } catch {
    warnings.add('XMind 标签或链接不符合长度、安全或数量限制，已跳过')
    return undefined
  }
}
