import type Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createDocument, createWorkbook, type MindMapWorkbook } from '@core'
import { assetBytes, createAsset } from '@assets'
import { decodeBrainstorming, encodeBrainstorming } from '@formats/brainstorming'
import { mutateNative } from '@tests/formats/content-native-fixture'
import { importXmind } from '@formats/xmind'
import { contentXmind } from '@tests/fixtures/xmind/archive'

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/xmind/${name}`, import.meta.url)))

const contentWorkbook = (): MindMapWorkbook => {
  const image = createAsset(fixture('pixel image.png'), '图片.png', 'picture')
  const attachment = createAsset(fixture('data.bin'), '数据.bin', 'attachment')
  const unused = createAsset(strToU8('unused'), 'unused.txt', 'unused')
  const base = createDocument('内容', 'content-document')
  const root = base.topics.root
  if (!root) throw new Error('Missing fixture root')
  return createWorkbook({
    ...base,
    assets: { picture: image, attachment, unused },
    topics: {
      root: {
        ...root,
        notes: '中文备注\n第二行',
        image: { assetId: 'picture', width: 1, height: 1 },
        attachments: ['attachment', 'picture'],
      },
    },
  })
}

describe('native embedded content', () => {
  it('roundtrips notes, image and binary attachment and omits unused assets', async () => {
    const original = contentWorkbook()
    const decoded = await decodeBrainstorming(await encodeBrainstorming(original))
    expect(decoded.sheets[0]?.document.topics).toEqual(original.sheets[0]?.document.topics)
    expect(
      assetBytes(
        decoded.sheets[0]?.document.assets?.attachment ??
          createAsset(new Uint8Array(), 'empty', 'empty'),
      ),
    ).toEqual(fixture('data.bin'))
    expect(decoded.sheets[0]?.document.assets?.unused).toBeUndefined()
  })

  it('rejects missing resource objects, corrupted bytes, unsupported image fields and duplicate attachment references', async () => {
    const mutations = [
      (db: Database.Database) => {
        db.exec('DELETE FROM resource_objects')
      },
      (db: Database.Database) => {
        db.exec("UPDATE resource_chunks SET data = x'00'")
      },
      (db: Database.Database) => {
        db.exec(`UPDATE topics SET data = json_set(data,'$.image.extra',1) WHERE id = 'root'`)
      },
      (db: Database.Database) => {
        db.exec(
          `UPDATE topics SET data = json_set(data,'$.attachments',json('["attachment","attachment"]')) WHERE id = 'root'`,
        )
      },
    ]
    for (const mutate of mutations)
      await expect(
        decodeBrainstorming(await mutateNative(contentWorkbook(), mutate)),
      ).rejects.toThrow()
  })

  it('validates declared MIME and image dimensions on save and open', async () => {
    const invalidType = await mutateNative(contentWorkbook(), (db) => {
      db.exec("UPDATE resources SET mime_type = 'text/html'")
    })
    await expect(decodeBrainstorming(invalidType)).rejects.toThrow(/类型|格式/)
    const dimensions = await mutateNative(contentWorkbook(), (db) => {
      db.exec(`UPDATE topics SET data = json_set(data,'$.image.width',2) WHERE id = 'root'`)
    })
    await expect(decodeBrainstorming(dimensions)).rejects.toThrow(/尺寸/)
    const original = contentWorkbook()
    const sheet = original.sheets[0]
    const root = sheet?.document.topics.root
    if (!sheet || !root) throw new Error('Missing fixture')
    await expect(
      encodeBrainstorming({
        ...original,
        sheets: [
          {
            ...sheet,
            document: {
              ...sheet.document,
              topics: { root: { ...root, image: { assetId: 'picture', width: 2, height: 1 } } },
            },
          },
        ],
      }),
    ).rejects.toThrow(/尺寸/)
  })
})

describe('XMind embedded content', () => {
  it.each([false, true])(
    'imports actual embedded PNG/attachment and plain/rich notes (legacy %s)',
    async (legacy) => {
      const { workbook, warnings } = importXmind(contentXmind(legacy))
      const document = workbook.sheets[0]?.document
      const root = document?.topics['content-root']
      const rich = document?.topics['rich-topic']
      expect(root?.notes).toBe('中文备注\n第二行')
      expect(root?.image).toEqual({ assetId: 'xmind-asset-1', width: 1, height: 1 })
      expect(root?.attachments).toEqual(rich?.attachments)
      expect(Object.keys(document?.assets ?? {})).toHaveLength(2)
      expect(rich?.notes).toBe(legacy ? '保留的富文本内容\n第二段' : '第一段 加粗\n第二段\n换行')
      expect(warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('富文本备注已转为纯文本')]),
      )
      expect(warnings.some((warning) => warning.includes('未引用'))).toBe(false)
      expect(await decodeBrainstorming(await encodeBrainstorming(workbook))).toEqual(workbook)
    },
  )

  it('skips unsafe, missing, malformed and oversized embedded images while preserving topic text and notes', () => {
    const archive = (src: string, bytes?: Uint8Array): Uint8Array =>
      zipSync({
        'content.json': strToU8(
          JSON.stringify([
            {
              title: 'Safe',
              rootTopic: {
                title: 'Preserved',
                notes: { plain: { content: 'Notes' } },
                image: { src },
              },
            },
          ]),
        ),
        ...(bytes ? { 'resources/picture.png': bytes } : {}),
      })
    for (const [src, bytes] of [
      ['https://example.com/picture.png', undefined],
      ['file:///tmp/picture.png', undefined],
      ['xap:resources/%2e%2e/picture.png', undefined],
      ['xap:resources/missing.png', undefined],
      ['xap:resources/picture.png', strToU8('<svg/>')],
      ['xap:resources/picture.png', new Uint8Array(8 * 1024 * 1024 + 1)],
    ] as const) {
      const { workbook, warnings } = importXmind(archive(src, bytes))
      const document = workbook.sheets[0]?.document
      expect(document?.topics[document.rootId]).toMatchObject({
        title: 'Preserved',
        notes: 'Notes',
      })
      expect(document?.topics[document.rootId]?.image).toBeUndefined()
      expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('图片')]))
    }
  })

  it('imports safe external links and reports unreferenced embedded resources', () => {
    const { workbook, warnings } = importXmind(
      zipSync({
        'content.json': strToU8(
          JSON.stringify([
            { title: 'Links', rootTopic: { title: 'Link', href: 'https://example.com' } },
          ]),
        ),
        'attachments/unused.bin': fixture('data.bin'),
      }),
    )
    const document = workbook.sheets[0]?.document
    expect(document?.topics[document.rootId]?.metadata?.link).toEqual({
      kind: 'url',
      url: 'https://example.com',
    })
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('未引用')]))
  })
})
