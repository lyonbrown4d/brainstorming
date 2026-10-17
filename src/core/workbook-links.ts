import type { MindMapDocument, MindMapSheet, MindMapWorkbook, Topic } from '@core/types'

export const validateWorkbookLinks = (sourceSheets: readonly MindMapSheet[]): void => {
  const sheets = new Map(sourceSheets.map((sheet) => [sheet.id, sheet.document]))
  for (const sheet of sourceSheets) {
    for (const topic of Object.values(sheet.document.topics)) {
      const link = topic.metadata?.link
      if (link?.kind !== 'topic' || link.sheetId === undefined) continue
      const target = sheets.get(link.sheetId)
      if (!target || !Object.hasOwn(target.topics, link.topicId))
        throw new Error('主题链接引用的画布或主题不存在')
    }
  }
}

/** Duplicated self-sheet links follow the copy; links to other sheets retain their destination. */
export const remapSheetLinks = (
  document: MindMapDocument,
  from: string,
  to: string,
): MindMapDocument => {
  const topics: Record<string, Topic> = { ...document.topics }
  let changed = false
  for (const topic of Object.values(topics)) {
    const link = topic.metadata?.link
    if (link?.kind !== 'topic' || link.sheetId !== from) continue
    topics[topic.id] = { ...topic, metadata: { ...topic.metadata, link: { ...link, sheetId: to } } }
    changed = true
  }
  return changed ? { ...document, topics } : document
}

/** Cleanup applies only to targets removed by this edit, never to newly invalid links. */
export const cleanupRemovedWorkbookTargets = (
  before: MindMapWorkbook,
  after: MindMapWorkbook,
): MindMapWorkbook => {
  const nextSheets = new Map(after.sheets.map((sheet) => [sheet.id, sheet.document]))
  const removed = new Map<string, Set<string>>()
  for (const sheet of before.sheets) {
    const next = nextSheets.get(sheet.id)
    const ids = new Set(
      Object.keys(sheet.document.topics).filter(
        (id) => next === undefined || !Object.hasOwn(next.topics, id),
      ),
    )
    if (ids.size > 0) removed.set(sheet.id, ids)
  }
  if (removed.size === 0) return after
  const sheets = after.sheets.map((sheet) => {
    const topics: Record<string, Topic> = { ...sheet.document.topics }
    let sheetChanged = false
    for (const topic of Object.values(topics)) {
      const link = topic.metadata?.link
      if (
        link?.kind !== 'topic' ||
        link.sheetId === undefined ||
        !removed.get(link.sheetId)?.has(link.topicId)
      )
        continue
      const metadata = { ...topic.metadata }
      delete metadata.link
      topics[topic.id] = { ...topic, metadata }
      sheetChanged = true
    }
    if (!sheetChanged) return sheet
    return { ...sheet, document: { ...sheet.document, topics } }
  })
  return sheets.some((sheet, index) => sheet !== after.sheets[index]) ? { ...after, sheets } : after
}
