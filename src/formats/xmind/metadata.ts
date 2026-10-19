import { isTaskPriority } from '@shared/taskPriority'
import type { TopicMetadata } from '@core/extensions'
import { validateTopicMetadata } from '@core/metadata-validation'
import { list, record, type SourceRecord, type Warnings } from '@formats/xmind/common'

/** Standard XMind priorities, labels and safe URL links remain data; importing never opens a URL. */
export const standardMetadata = (
  source: SourceRecord,
  warnings: Warnings,
): TopicMetadata | undefined => {
  const metadata: {
    labels?: string[]
    link?: { kind: 'url'; url: string }
    task?: TopicMetadata['task']
  } = {}
  const markers = list(source.markers, 'markers')
  if (markers.length > 128) throw new Error('XMind 图标数量超过 128')
  for (const entry of markers) {
    const marker = record(entry, 'marker').markerId
    const priority =
      typeof marker === 'string' && /^priority-[1-9]$/.test(marker)
        ? Number(marker.slice(-1))
        : undefined
    if (isTaskPriority(priority)) {
      if (metadata.task) warnings.add('XMind 重复的优先级已跳过')
      else metadata.task = { priority }
    } else warnings.add('未导入 XMind 图标')
  }
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
