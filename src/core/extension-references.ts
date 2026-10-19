import type { MindMapDocument, Topic } from '@core/types'
import { validateDrawings } from '@core/ink'
import type { DocumentExtensions, TopicMetadata } from '@core/extensions'
import * as v from '@core/extension-validation'
import { validateDocumentSettings } from '@core/metadata-validation'
import {
  validateFloatingPosition,
  validatePresentationStep,
  validateRelation,
  validateTopicCallout,
  validateTopicGroup,
} from '@core/annotation-validation'

export const validateDocumentExtensions = (
  value: Record<string, unknown>,
  topics: Readonly<Record<string, Topic>>,
  rootId: string,
): void => {
  const require = (id: string): void => {
    if (!Object.hasOwn(topics, id)) throw new Error(`扩展引用的主题 ${id} 不存在`)
  }
  v.optional(value, 'settings', validateDocumentSettings)
  v.optional(value, 'drawings', validateDrawings)
  const annotationIds = new Set<string>()
  const annotationId = (id: string): void => {
    if (annotationIds.has(id)) throw new Error('批注 ID 重复')
    annotationIds.add(id)
  }
  v.optional(value, 'relations', (entry) => {
    for (const relation of v.list(entry, 5000)) {
      validateRelation(relation)
      annotationId(relation.id)
      require(relation.from)
      require(relation.to)
    }
  })
  v.optional(value, 'groups', (entry) => {
    for (const group of v.list(entry, 5000)) {
      validateTopicGroup(group)
      annotationId(group.id)
      for (const id of group.topicIds) require(id)
    }
  })
  v.optional(value, 'callouts', (entry) => {
    for (const callout of v.list(entry, 5000)) {
      validateTopicCallout(callout)
      annotationId(callout.id)
      require(callout.topicId)
    }
  })
  const floatingIds = Object.hasOwn(value, 'floatingIds') ? v.ids(value.floatingIds, 20_000) : []
  const root = topics[rootId]
  for (const id of floatingIds) {
    require(id)
    if (!root?.children.includes(id)) throw new Error('游离主题必须是中心主题的直接子主题')
  }
  v.optional(value, 'floatingPositions', (entry) => {
    for (const [id, position] of Object.entries(v.record(entry))) {
      if (!floatingIds.includes(id)) throw new Error('位置仅可属于游离主题')
      validateFloatingPosition(position)
    }
  })
  v.optional(value, 'presentation', (entry) => {
    for (const step of v.list(entry, 1000)) {
      validatePresentationStep(step)
      require(step.topicId)
    }
  })
  const dependencies = new Map<string, readonly string[]>()
  const indegree = new Map<string, number>()
  for (const topic of Object.values(topics)) {
    const link = topic.metadata?.link
    if (link?.kind === 'topic' && link.sheetId === undefined) require(link.topicId)
    const ids = topic.metadata?.task?.dependencies ?? []
    indegree.set(topic.id, 0)
    dependencies.set(topic.id, ids)
    for (const id of ids) {
      require(id)
      if (id === topic.id) throw new Error('任务不能依赖自身')
    }
  }
  for (const ids of dependencies.values())
    for (const id of ids) indegree.set(id, (indegree.get(id) ?? 0) + 1)
  const ready = [...indegree].filter(([, count]) => count === 0).map(([id]) => id)
  let visited = 0
  while (ready.length > 0) {
    const id = ready.pop()
    if (id === undefined) break
    visited += 1
    for (const dependency of dependencies.get(id) ?? []) {
      const remaining = (indegree.get(dependency) ?? 0) - 1
      indegree.set(dependency, remaining)
      if (remaining === 0) ready.push(dependency)
    }
  }
  if (visited !== indegree.size) throw new Error('任务依赖包含循环')
}

/** Keep only references that remain meaningful after removing or copying topics. */
export const pruneTopicMetadata = (
  metadata: TopicMetadata,
  retained: ReadonlySet<string>,
): TopicMetadata => {
  const result = { ...structuredClone(metadata) }
  const link = result.link
  if (link?.kind === 'topic' && link.sheetId === undefined && !retained.has(link.topicId))
    delete result.link
  if (result.task?.dependencies)
    result.task = {
      ...result.task,
      dependencies: result.task.dependencies.filter((id) => retained.has(id)),
    }
  return result
}

export const pruneDocumentReferences = (document: MindMapDocument): MindMapDocument => {
  const retained = new Set(Object.keys(document.topics))
  const topics: Record<string, Topic> = { ...document.topics }
  for (const topic of Object.values(topics)) {
    if (!topic.metadata) continue
    const metadata = pruneTopicMetadata(topic.metadata, retained)
    if (JSON.stringify(metadata) !== JSON.stringify(topic.metadata))
      topics[topic.id] = { ...topic, metadata }
  }
  const root = topics[document.rootId]
  const floatingIds = document.floatingIds?.filter((id) => root?.children.includes(id))
  const extensions: DocumentExtensions = {
    ...(document.relations === undefined
      ? {}
      : {
          relations: document.relations.filter(
            ({ from, to }) => retained.has(from) && retained.has(to),
          ),
        }),
    ...(document.groups === undefined
      ? {}
      : {
          groups: document.groups
            .map((group) => ({
              ...group,
              topicIds: group.topicIds.filter((id) => retained.has(id)),
            }))
            .filter((group) => group.topicIds.length > 0),
        }),
    ...(document.callouts === undefined
      ? {}
      : { callouts: document.callouts.filter(({ topicId }) => retained.has(topicId)) }),
    ...(floatingIds === undefined ? {} : { floatingIds }),
    ...(document.floatingPositions === undefined
      ? {}
      : {
          floatingPositions: Object.fromEntries(
            Object.entries(document.floatingPositions).filter(([id]) => floatingIds?.includes(id)),
          ),
        }),
    ...(document.presentation === undefined
      ? {}
      : { presentation: document.presentation.filter(({ topicId }) => retained.has(topicId)) }),
  }
  return { ...document, topics, ...extensions }
}

export const clearFloatingRoots = (
  document: MindMapDocument,
  topicIds: readonly string[],
): MindMapDocument => {
  if (!document.floatingIds?.some((id) => topicIds.includes(id))) return document
  const remaining = document.floatingIds.filter((id) => !topicIds.includes(id))
  return {
    ...document,
    floatingIds: remaining,
    ...(document.floatingPositions === undefined
      ? {}
      : {
          floatingPositions: Object.fromEntries(
            Object.entries(document.floatingPositions).filter(([id]) => remaining.includes(id)),
          ),
        }),
  }
}
