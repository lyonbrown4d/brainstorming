import type { MindMapDocument, Topic } from '@core/types'
import type { TopicGroup } from '@core/extensions'

export const topicParents = (document: MindMapDocument): ReadonlyMap<string, string> => {
  const parents = new Map<string, string>()
  for (const topic of Object.values(document.topics))
    for (const id of topic.children) parents.set(id, topic.id)
  return parents
}

const ancestorOf = (
  ancestor: string,
  descendant: string,
  parents: ReadonlyMap<string, string>,
): boolean => {
  let current = parents.get(descendant)
  while (current !== undefined) {
    if (current === ancestor) return true
    current = parents.get(current)
  }
  return false
}

export const summaryLinkIsSafe = (
  group: TopicGroup,
  parents: ReadonlyMap<string, string>,
  rootId: string,
): boolean => {
  const id = group.summaryTopicId
  if (id === undefined) return true
  if (id === rootId) return false
  return group.topicIds.every(
    (member) =>
      member !== id && !ancestorOf(id, member, parents) && !ancestorOf(member, id, parents),
  )
}

/** A move that crosses its source range converts the summary topic into a normal topic. */
export const sanitizeSummaryLinks = (document: MindMapDocument): MindMapDocument => {
  if (!document.groups) return document
  const previous = document.groups
  const parents = topicParents(document)
  const groups = previous.map((group) => {
    if (group.summaryTopicId === undefined || summaryLinkIsSafe(group, parents, document.rootId))
      return group
    const plain = { ...group }
    delete plain.summaryTopicId
    return {
      ...plain,
      title: plain.title ?? document.topics[group.summaryTopicId]?.title ?? '',
    }
  })
  return groups.every((group, index) => group === previous[index])
    ? document
    : { ...document, groups }
}

/** Split a selection into ordered, adjacent sibling ranges on the same branch side. */
export const summarySelectionRanges = (
  document: MindMapDocument,
  selectedIds: readonly string[],
): readonly (readonly string[])[] => {
  const selected = new Set(selectedIds)
  const excluded = new Set([
    ...(document.floatingIds ?? []),
    ...(document.groups ?? []).flatMap((group) =>
      group.summaryTopicId === undefined ? [] : [group.summaryTopicId],
    ),
  ])
  const result: string[][] = []
  for (const parent of Object.values(document.topics)) {
    let current: string[] = []
    let side: Topic['side'] | undefined
    const flush = (): void => {
      if (current.length > 0) result.push(current)
      current = []
      side = undefined
    }
    for (const id of parent.children) {
      const topic = document.topics[id]
      if (!topic || !selected.has(id) || excluded.has(id)) {
        flush()
        continue
      }
      if (side !== undefined && topic.side !== side) flush()
      current.push(id)
      side = topic.side
    }
    flush()
  }
  return result
}

/** Scope edits must keep a visible, ordered sibling range. Existing groups may survive tree edits. */
export const assertSummaryRange = (document: MindMapDocument, group: TopicGroup): void => {
  if (group.kind !== 'summary') return
  const range = summarySelectionRanges(document, group.topicIds)
  if (range.length !== 1 || range[0]?.length !== group.topicIds.length)
    throw new Error('概要范围必须是同一父主题下连续的子主题')
  if (!group.topicIds.every((id, index) => range[0]?.[index] === id))
    throw new Error('概要主题顺序与分支顺序不一致')
}
