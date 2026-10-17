import { referencedAssetIds } from '@core/topic-content'
import type { NativeConnection } from '@main/document-db/connection'
import type { Relation, TopicGroup, TopicCallout, PresentationStep } from '@core/extensions'
import type { DocumentAsset, MindMapSheet, MindMapWorkbook, Topic } from '@core/types'
import { onlyKeys, record, validateBoundedWorkbook } from '@formats/brainstorming/validation'
import { checkProtocol } from '@main/document-db/pool'
import { resourceStorage } from '@main/document-db/resources'
import { STRUCTURAL_TABLES, type NativeRow, type StructuralTable } from '@main/document-db/rows'

const parse = (value: string | number | null | undefined): unknown => {
  if (typeof value !== 'string') throw new Error('Brainstorming 文档字段无效')
  return JSON.parse(value) as unknown
}
const text = (value: string | number | null | undefined): string => {
  if (typeof value !== 'string') throw new Error('Brainstorming 文档字段无效')
  return value
}

export type StructuralRows = Record<StructuralTable, NativeRow[]>
export const readWorkbook = async (
  db: NativeConnection,
  snapshot?: StructuralRows,
): Promise<MindMapWorkbook> => {
  await checkProtocol(db)
  const rows =
    snapshot ??
    (Object.fromEntries(
      await Promise.all(
        STRUCTURAL_TABLES.map(async (table) => [
          table,
          await db.prepare(`SELECT * FROM ${table}`).all(),
        ]),
      ),
    ) as StructuralRows)
  const objects = (await db.prepare('SELECT id,byte_length FROM resource_objects').all()) as {
    id: string
    byte_length: number
  }[]
  const objectSizes = new Map(objects.map((object) => [object.id, object.byte_length]))
  const document = rows.document[0]
  if (!document) throw new Error('Brainstorming 文档缺少工作簿')
  const sheets = rows.sheets
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((sheet): MindMapSheet => {
      const id = text(sheet.id)
      const select = (table: StructuralTable): NativeRow[] =>
        rows[table]
          .filter((row) => row.sheet_id === id)
          .sort((a, b) => Number(a.position) - Number(b.position))
      const topicRows = select('topics')
      const topics: Record<string, Topic> = {}
      const children = new Map<string, NativeRow[]>()
      for (const row of topicRows) {
        if (row.parent_id === null) continue
        const parent = text(row.parent_id)
        const siblings = children.get(parent) ?? []
        siblings.push(row)
        children.set(parent, siblings)
      }
      for (const siblings of children.values()) {
        siblings.sort((a, b) => Number(a.position) - Number(b.position))
        if (siblings.some((row, index) => row.position !== index)) throw new Error('主题顺序无效')
      }
      for (const row of topicRows) {
        const data = parse(row.data) as Omit<Topic, 'children'>
        onlyKeys(record(data), [
          'id',
          'title',
          'collapsed',
          'side',
          'style',
          'notes',
          'image',
          'attachments',
          'metadata',
          'structure',
        ])
        if (data.image) onlyKeys(record(data.image), ['assetId', 'width', 'height'])
        if (data.id !== row.id || 'children' in data)
          throw new Error('Brainstorming 主题标识或子节点无效')
        topics[data.id] = {
          ...data,
          children: (children.get(text(row.id)) ?? []).map((child) => text(child.id)),
        }
      }
      for (const row of topicRows) {
        if (row.parent_id !== null && !topics[text(row.parent_id)])
          throw new Error('主题父节点不存在')
      }
      const metadata = parse(sheet.metadata) as Record<string, unknown> & {
        arrays: Record<string, boolean>
        assets: boolean
      }
      const { arrays, assets: hadAssets, ...extensions } = metadata
      const assets: Record<string, DocumentAsset> = {}
      for (const row of select('resources')) {
        const storage = resourceStorage(text(row.metadata))
        if (storage.objectId !== row.object_id) throw new Error('资源对象引用无效')
        if (objectSizes.get(storage.objectId) !== storage.byteLength)
          throw new Error('资源对象缺失或长度无效')
        assets[text(row.id)] = {
          id: text(row.id),
          name: text(row.name),
          mimeType: text(row.mime_type),
          storage,
        }
      }
      const annotations = {
        ...(arrays.relations
          ? { relations: select('relations').map((row) => parse(row.data) as Relation) }
          : {}),
        ...(arrays.groups
          ? {
              groups: select('topic_groups').map((row) => ({
                ...(parse(row.data) as Omit<TopicGroup, 'topicIds'>),
                topicIds: select('group_members')
                  .filter((member) => member.group_id === row.id)
                  .map((member) => text(member.topic_id)),
              })),
            }
          : {}),
        ...(arrays.callouts
          ? { callouts: select('callouts').map((row) => parse(row.data) as TopicCallout) }
          : {}),
        ...(arrays.presentation
          ? {
              presentation: select('presentation_steps').map(
                (row) => parse(row.data) as PresentationStep,
              ),
            }
          : {}),
      }
      return {
        id,
        name: text(sheet.name),
        document: {
          format: 'brainstorming',
          version: 1,
          id: text(sheet.document_id),
          title: text(sheet.title),
          rootId: text(sheet.root_id),
          topics,
          ...extensions,
          ...annotations,
          ...(hadAssets ? { assets } : {}),
        },
      }
    })
  const sheetIds = new Set(sheets.map((sheet) => sheet.id))
  for (const table of STRUCTURAL_TABLES) {
    if (table === 'document' || table === 'sheets') continue
    if (rows[table].some((row) => !sheetIds.has(text(row.sheet_id))))
      throw new Error('文档包含不属于画布的记录')
  }
  const workbook: MindMapWorkbook = {
    format: 'brainstorming',
    version: 2,
    id: text(document.id),
    title: text(document.title),
    sheets,
  }
  validateBoundedWorkbook(workbook)
  for (const sheet of workbook.sheets) {
    const expected: string[] = []
    for (const topic of Object.values(sheet.document.topics)) {
      if (topic.image) expected.push(JSON.stringify([topic.id, 'image', 0, topic.image.assetId]))
      topic.attachments?.forEach((id, position) =>
        expected.push(JSON.stringify([topic.id, 'attachment', position, id])),
      )
      if (topic.metadata?.audioAssetId)
        expected.push(JSON.stringify([topic.id, 'audio', 0, topic.metadata.audioAssetId]))
    }
    const actual = rows.topic_resources
      .filter((row) => row.sheet_id === sheet.id)
      .map((row) => JSON.stringify([row.topic_id, row.role, row.position, row.resource_id]))
    if (JSON.stringify(expected.sort()) !== JSON.stringify(actual.sort()))
      throw new Error('主题资源关联记录不一致')
    const used = referencedAssetIds(sheet.document.topics)
    if (Object.keys(sheet.document.assets ?? {}).some((id) => !used.has(id)))
      throw new Error('文档资源未引用')
  }
  return workbook
}
