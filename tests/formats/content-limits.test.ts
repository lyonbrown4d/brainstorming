import { describe, expect, it } from 'vitest'
import { createDocument, createWorkbook, type DocumentAsset, type Topic } from '@core'
import { createAsset } from '@assets'
import { decodeBrainstorming, encodeBrainstorming } from '@formats/brainstorming'

describe('native SQLite resource capacity', () => {
  it('stores deduplicated resources across sheets without the former aggregate ZIP limit', async () => {
    const asset = createAsset(new Uint8Array(7 * 1024 * 1024), 'large.bin', 'large-a')
    const second = { ...asset, id: 'large-b' }
    const base = createDocument('Large', 'large-document')
    const root = base.topics.root
    if (!root) throw new Error('Missing fixture root')
    const document = {
      ...base,
      assets: { 'large-a': asset, 'large-b': second },
      topics: { root: { ...root, attachments: ['large-a', 'large-b'] } },
    }
    const workbook = createWorkbook(document)
    const sheet = workbook.sheets[0]
    if (!sheet) throw new Error('Missing fixture sheet')
    const original = { ...workbook, sheets: [sheet, { ...sheet, id: 'sheet-two' }] }
    expect(await decodeBrainstorming(await encodeBrainstorming(original))).toEqual(original)
  })

  it('roundtrips more than the former ZIP archive entry limit', async () => {
    const base = createDocument('Many', 'many-document')
    const root = base.topics.root
    if (!root) throw new Error('Missing fixture root')
    const assets: Record<string, DocumentAsset> = {}
    const topics: Record<string, Topic> = {}
    const children = Array.from({ length: 16 }, (_, index) => `topic-${index}`)
    topics.root = { ...root, children }
    for (const [index, id] of children.entries()) {
      const attachments = Array.from(
        { length: 32 },
        (_, assetIndex) => `asset-${index}-${assetIndex}`,
      )
      for (const assetId of attachments)
        assets[assetId] = createAsset(new Uint8Array(), 'empty.bin', assetId)
      topics[id] = { id, title: id, side: 'right', children: [], collapsed: false, attachments }
    }
    const original = createWorkbook({ ...base, topics, assets })
    expect(await decodeBrainstorming(await encodeBrainstorming(original))).toEqual(original)
  })
})
