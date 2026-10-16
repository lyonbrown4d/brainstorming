import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createDocument, createWorkbook, type DocumentAsset, type Topic } from '../../src/core'
import { createAsset } from '../../src/assets'
import { readArchive } from '../../src/formats/archive'
import { decodeTrelyx, encodeTrelyx } from '../../src/formats/trelyx'

describe('native asset budgets', () => {
  it('bounds aggregate resources across sheets on save and open', () => {
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
    expect(() =>
      encodeTrelyx({ ...workbook, sheets: [sheet, { ...sheet, id: 'sheet-two' }] }),
    ).toThrow(/24 MiB/)
    const entries = Object.fromEntries(readArchive(encodeTrelyx(workbook)))
    const content = JSON.parse(new TextDecoder().decode(entries['document.json'])) as {
      sheets: { id: string; document: { assets: Record<string, { path: string }> } }[]
    }
    const stored = content.sheets[0]
    if (!stored) throw new Error('Missing stored sheet')
    content.sheets.push({
      ...stored,
      id: 'sheet-two',
      document: {
        ...stored.document,
        assets: Object.fromEntries(
          Object.entries(stored.document.assets).map(([id, metadata]) => [
            id,
            { ...metadata, path: `assets/1/${id}` },
          ]),
        ),
      },
    })
    entries['document.json'] = strToU8(JSON.stringify(content))
    entries['assets/1/large-a'] = new Uint8Array(7 * 1024 * 1024)
    entries['assets/1/large-b'] = new Uint8Array(7 * 1024 * 1024)
    expect(() => decodeTrelyx(zipSync(entries))).toThrow(/24 MiB/)
  })

  it('rejects a native write with more archive entries than the reader accepts', () => {
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
    expect(() => encodeTrelyx(createWorkbook({ ...base, topics, assets }))).toThrow(/512/)
  })
})
