import type { DocumentAnnotations, TopicMetadata } from '@core/extensions'
import type { MindMapDocument, TopicClipboard } from '@core/types'
import { assertId } from '@core/validation'
import { record } from '@core/extension-validation'

export const clipboardAnnotations = (
  document: MindMapDocument,
  retained: ReadonlySet<string>,
): DocumentAnnotations => {
  return {
    ...(document.relations === undefined
      ? {}
      : {
          relations: structuredClone(
            document.relations.filter(({ from, to }) => retained.has(from) && retained.has(to)),
          ),
        }),
    ...(document.groups === undefined
      ? {}
      : {
          groups: structuredClone(
            document.groups.filter(
              ({ topicIds, summaryTopicId }) =>
                topicIds.every((id) => retained.has(id)) &&
                (summaryTopicId === undefined || retained.has(summaryTopicId)),
            ),
          ),
        }),
    ...(document.callouts === undefined
      ? {}
      : {
          callouts: structuredClone(
            document.callouts.filter(({ topicId }) => retained.has(topicId)),
          ),
        }),
  }
}
const mapped = (mapping: Readonly<Record<string, string>>, id: string): string => {
  const result = Object.hasOwn(mapping, id) ? mapping[id] : undefined
  if (result === undefined) throw new Error('剪贴板扩展 ID 映射不完整')
  return result
}
export const remapMetadata = (
  metadata: TopicMetadata,
  topicIds: Readonly<Record<string, string>>,
  assetIds: Readonly<Record<string, string>>,
): TopicMetadata => {
  const result = { ...structuredClone(metadata) }
  if (result.link?.kind === 'topic' && result.link.sheetId === undefined)
    result.link = { ...result.link, topicId: mapped(topicIds, result.link.topicId) }
  if (result.task?.dependencies)
    result.task = {
      ...result.task,
      dependencies: result.task.dependencies.map((id) => mapped(topicIds, id)),
    }
  if (result.audioAssetId !== undefined) result.audioAssetId = mapped(assetIds, result.audioAssetId)
  return result
}
export const pasteAnnotations = (
  document: MindMapDocument,
  clipboard: TopicClipboard,
  topicIds: Readonly<Record<string, string>>,
  annotationIds?: Readonly<Record<string, string>>,
): DocumentAnnotations => {
  const source = [
    ...(clipboard.relations ?? []),
    ...(clipboard.groups ?? []),
    ...(clipboard.callouts ?? []),
  ]
  const occupied = new Set(
    [...(document.relations ?? []), ...(document.groups ?? []), ...(document.callouts ?? [])].map(
      ({ id }) => id,
    ),
  )
  const mapping: Record<string, string> = {}
  if (annotationIds !== undefined) {
    record(annotationIds)
    if (Object.keys(annotationIds).length !== source.length)
      throw new Error('剪贴板批注 ID 映射不完整')
  }
  const firstRoot = clipboard.roots[0]
  if (firstRoot === undefined) throw new Error('剪贴板根主题不存在')
  for (const { id } of source) {
    let target =
      annotationIds === undefined
        ? `copy-${mapped(topicIds, firstRoot)}-${id}`
        : mapped(annotationIds, id)
    assertId(target)
    if (annotationIds === undefined) {
      const base = target
      let suffix = 1
      while (occupied.has(target)) {
        target = `${base}-${suffix}`
        suffix += 1
      }
    } else if (occupied.has(target)) throw new Error('剪贴板批注 ID 映射冲突')
    occupied.add(target)
    mapping[id] = target
  }
  return {
    ...(clipboard.relations === undefined
      ? {}
      : {
          relations: [
            ...(document.relations ?? []),
            ...clipboard.relations.map((item) => ({
              ...structuredClone(item),
              id: mapped(mapping, item.id),
              from: mapped(topicIds, item.from),
              to: mapped(topicIds, item.to),
            })),
          ],
        }),
    ...(clipboard.groups === undefined
      ? {}
      : {
          groups: [
            ...(document.groups ?? []),
            ...clipboard.groups.map((item) => ({
              ...structuredClone(item),
              id: mapped(mapping, item.id),
              topicIds: item.topicIds.map((id) => mapped(topicIds, id)),
              ...(item.summaryTopicId === undefined
                ? {}
                : { summaryTopicId: mapped(topicIds, item.summaryTopicId) }),
            })),
          ],
        }),
    ...(clipboard.callouts === undefined
      ? {}
      : {
          callouts: [
            ...(document.callouts ?? []),
            ...clipboard.callouts.map((item) => ({
              ...structuredClone(item),
              id: mapped(mapping, item.id),
              topicId: mapped(topicIds, item.topicId),
            })),
          ],
        }),
  }
}
