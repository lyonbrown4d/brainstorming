import type { NativeConnection } from '@main/document-db/connection'
import type { MindMapWorkbook } from '@core/types'
import { documentExtensionData } from '@core/extension-data'

export type NativeRow = Record<string, string | number | null>
export type StructuralTable =
  | 'document'
  | 'sheets'
  | 'topics'
  | 'relations'
  | 'topic_groups'
  | 'group_members'
  | 'callouts'
  | 'presentation_steps'
  | 'resources'
  | 'topic_resources'
export const STRUCTURAL_TABLES: readonly StructuralTable[] = [
  'document',
  'sheets',
  'topics',
  'relations',
  'topic_groups',
  'group_members',
  'callouts',
  'presentation_steps',
  'resources',
  'topic_resources',
]
const keyColumns: Record<StructuralTable, readonly string[]> = {
  document: ['id'],
  sheets: ['id'],
  topics: ['sheet_id', 'id'],
  relations: ['sheet_id', 'id'],
  topic_groups: ['sheet_id', 'id'],
  group_members: ['sheet_id', 'group_id', 'topic_id'],
  callouts: ['sheet_id', 'id'],
  presentation_steps: ['sheet_id', 'position'],
  resources: ['sheet_id', 'id'],
  topic_resources: ['sheet_id', 'topic_id', 'role', 'position'],
}
const rowKey = (row: NativeRow, columns: readonly string[]): string =>
  JSON.stringify(columns.map((column) => row[column]))

/** Diff small structural rows; immutable resource objects never participate in this replacement. */
export const synchronizeRows = async (
  db: NativeConnection,
  table: StructuralTable,
  rows: readonly NativeRow[],
): Promise<void> => {
  const keys = keyColumns[table]
  const existing = (await db.prepare(`SELECT * FROM ${table}`).all()) as NativeRow[]
  const previous = new Map(existing.map((row) => [rowKey(row, keys), row]))
  const retained = new Set(rows.map((row) => rowKey(row, keys)))
  const remove = db.prepare(
    `DELETE FROM ${table} WHERE ${keys.map((key) => `${key} = ?`).join(' AND ')}`,
  )
  for (const row of existing)
    if (!retained.has(rowKey(row, keys))) await remove.run(...keys.map((key) => row[key]))
  for (const row of rows) {
    const old = previous.get(rowKey(row, keys))
    const columns = Object.keys(row)
    if (old && columns.every((column) => old[column] === row[column])) continue
    const statement = db.prepare(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT (${keys.join(',')}) DO UPDATE SET ${columns
        .filter((column) => !keys.includes(column))
        .map((column) => `${column}=excluded.${column}`)
        .join(',')}`,
    )
    await statement.run(...columns.map((column) => row[column]))
  }
}

export const structuralRows = (workbook: MindMapWorkbook): Record<StructuralTable, NativeRow[]> => {
  const rows = Object.fromEntries(
    STRUCTURAL_TABLES.map((table) => [table, []]),
  ) as unknown as Record<StructuralTable, NativeRow[]>
  rows.document.push({
    id: workbook.id,
    title: workbook.title,
    protocol: 1,
    required_features: JSON.stringify(['ordered-topics', 'chunked-resources']),
  })
  for (const [position, sheet] of workbook.sheets.entries()) {
    const doc = sheet.document
    const extensions = documentExtensionData(doc)
    const { relations, groups, callouts, presentation, ...metadata } = extensions
    rows.sheets.push({
      id: sheet.id,
      position,
      document_id: doc.id,
      name: sheet.name,
      title: doc.title,
      root_id: doc.rootId,
      metadata: JSON.stringify({
        ...metadata,
        arrays: {
          relations: relations !== undefined,
          groups: groups !== undefined,
          callouts: callouts !== undefined,
          presentation: presentation !== undefined,
        },
        assets: doc.assets !== undefined,
      }),
    })
    const parents = new Map<string, { parent: string; position: number }>()
    for (const topic of Object.values(doc.topics))
      topic.children.forEach((id, position) => parents.set(id, { parent: topic.id, position }))
    for (const topic of Object.values(doc.topics)) {
      const data = Object.fromEntries(Object.entries(topic).filter(([key]) => key !== 'children'))
      const parent = parents.get(topic.id)
      rows.topics.push({
        sheet_id: sheet.id,
        id: topic.id,
        parent_id: parent?.parent ?? null,
        position: parent?.position ?? doc.floatingIds?.indexOf(topic.id) ?? 0,
        data: JSON.stringify(data),
      })
      const references = [
        ...(topic.image ? [{ id: topic.image.assetId, role: 'image', position: 0 }] : []),
        ...(topic.attachments?.map((id, position) => ({ id, role: 'attachment', position })) ?? []),
        ...(topic.metadata?.audioAssetId
          ? [{ id: topic.metadata.audioAssetId, role: 'audio', position: 0 }]
          : []),
      ]
      for (const ref of references)
        rows.topic_resources.push({
          sheet_id: sheet.id,
          topic_id: topic.id,
          resource_id: ref.id,
          role: ref.role,
          position: ref.position,
        })
    }
    for (const [index, item] of (relations ?? []).entries())
      rows.relations.push({
        sheet_id: sheet.id,
        id: item.id,
        position: index,
        data: JSON.stringify(item),
      })
    for (const [index, item] of (groups ?? []).entries()) {
      const { topicIds, ...data } = item
      rows.topic_groups.push({
        sheet_id: sheet.id,
        id: item.id,
        position: index,
        data: JSON.stringify(data),
      })
      topicIds.forEach((id, position) =>
        rows.group_members.push({ sheet_id: sheet.id, group_id: item.id, topic_id: id, position }),
      )
    }
    for (const [index, item] of (callouts ?? []).entries())
      rows.callouts.push({
        sheet_id: sheet.id,
        id: item.id,
        position: index,
        data: JSON.stringify(item),
      })
    for (const [position, item] of (presentation ?? []).entries())
      rows.presentation_steps.push({ sheet_id: sheet.id, position, data: JSON.stringify(item) })
  }
  return rows
}
