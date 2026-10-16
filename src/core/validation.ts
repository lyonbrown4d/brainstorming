import type { MindMapDocument, Topic } from './types'
import { validateTopicStyle } from './topic-style'

const forbiddenIds = new Set(['__proto__', 'prototype', 'constructor'])

export function assertId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.trim().length === 0 || forbiddenIds.has(id)) {
    throw new Error('主题 ID 无效或使用了保留名称')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  )
}

function own(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

function assertTopic(value: unknown, key: string): asserts value is Topic {
  if (!isRecord(value)) throw new Error(`主题 ${key} 的格式无效`)
  assertId(key)
  if (
    own(value, 'id') !== key ||
    typeof own(value, 'title') !== 'string' ||
    typeof own(value, 'collapsed') !== 'boolean' ||
    (own(value, 'side') !== 'left' && own(value, 'side') !== 'right')
  ) {
    throw new Error(`主题 ${key} 的属性无效`)
  }
  const children = own(value, 'children')
  if (Object.hasOwn(value, 'style')) validateTopicStyle(value.style)
  if (!Array.isArray(children)) throw new Error(`主题 ${key} 的子主题列表无效`)
  for (const child of children) assertId(child)
}

/** Validate the flat tree iteratively, including documents with thousands of levels. */
export function validateDocument(value: unknown): asserts value is MindMapDocument {
  if (!isRecord(value) || own(value, 'format') !== 'trelyx') throw new Error('文件不是 Trelyx 文档')
  if (own(value, 'version') !== 1) throw new Error('不支持此 Trelyx 文档版本')
  if (
    typeof own(value, 'id') !== 'string' ||
    String(value.id).trim().length === 0 ||
    typeof own(value, 'title') !== 'string'
  )
    throw new Error('文档属性无效')
  const rootId = own(value, 'rootId')
  assertId(rootId)
  const topics = own(value, 'topics')
  if (!isRecord(topics) || !Object.hasOwn(topics, rootId)) throw new Error('缺少中心主题')
  for (const [id, topic] of Object.entries(topics)) assertTopic(topic, id)
  const typedTopics = topics as Record<string, Topic>
  const root = typedTopics[rootId]
  if (!root || root.title !== value.title || root.side !== 'right')
    throw new Error('中心主题属性与文档不一致')
  const visited = new Set<string>()
  const pending = [rootId]
  while (pending.length > 0) {
    const id = pending.pop()
    if (id === undefined) break
    if (visited.has(id)) throw new Error('主题树包含循环、重复子主题或多个父主题')
    visited.add(id)
    const topic = typedTopics[id]
    if (!topic || !Object.hasOwn(typedTopics, id)) throw new Error(`子主题 ${id} 不存在`)
    for (const childId of topic.children) {
      const child = typedTopics[childId]
      if (!child || !Object.hasOwn(typedTopics, childId))
        throw new Error(`子主题 ${childId} 不存在`)
      if (id !== rootId && child.side !== topic.side) throw new Error('分支内的主题方向必须一致')
      pending.push(childId)
    }
  }
  if (visited.size !== Object.keys(topics).length) throw new Error('文档包含不可达主题')
}
