import { readFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createDocument, createWorkbook, type MindMapWorkbook } from '../../src/core'
import { assetBytes, createAsset } from '../../src/assets'
import { decodeTrelyx, encodeTrelyx } from '../../src/formats/trelyx'
import { readArchive } from '../../src/formats/archive'
import { importXmind } from '../../src/formats/xmind'
import { contentXmind } from '../fixtures/xmind/archive'

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/xmind/${name}`, import.meta.url)))

function contentWorkbook(): MindMapWorkbook {
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

function modifyContent(
  mutate: (content: Record<string, unknown>, entries: Record<string, Uint8Array>) => void,
): Uint8Array {
  const entries = Object.fromEntries(readArchive(encodeTrelyx(contentWorkbook())))
  const content = JSON.parse(new TextDecoder().decode(entries['document.json'])) as Record<
    string,
    unknown
  >
  mutate(content, entries)
  entries['document.json'] = strToU8(JSON.stringify(content))
  return zipSync(entries)
}

function documentOf(content: Record<string, unknown>): Record<string, unknown> {
  return (content.sheets as { document: Record<string, unknown> }[])[0]?.document ?? {}
}

function assetOf(content: Record<string, unknown>): Record<string, unknown> {
  return (documentOf(content).assets as Record<string, Record<string, unknown>>).picture ?? {}
}

function rootOf(content: Record<string, unknown>): Record<string, unknown> {
  return (documentOf(content).topics as Record<string, Record<string, unknown>>).root ?? {}
}

describe('native embedded content', () => {
  it('roundtrips notes, image and binary attachment, deduplicates references and omits unused assets', () => {
    const original = contentWorkbook()
    const bytes = encodeTrelyx(original)
    const entries = readArchive(bytes)
    expect([...entries.keys()].filter((path) => path.startsWith('assets/'))).toEqual([
      'assets/0/picture',
      'assets/0/attachment',
    ])
    expect(entries.get('assets/0/picture')).toEqual(fixture('pixel image.png'))
    const decoded = decodeTrelyx(bytes)
    expect(decoded.sheets[0]?.document.topics).toEqual(original.sheets[0]?.document.topics)
    expect(
      assetBytes(
        decoded.sheets[0]?.document.assets?.attachment ??
          createAsset(new Uint8Array(), 'empty', 'empty'),
      ),
    ).toEqual(fixture('data.bin'))
    expect(decoded.sheets[0]?.document.assets?.unused).toBeUndefined()
    const content = JSON.parse(new TextDecoder().decode(entries.get('document.json'))) as Record<
      string,
      unknown
    >
    expect(assetOf(content)).toEqual({
      id: 'picture',
      name: '图片.png',
      mimeType: 'image/png',
      path: 'assets/0/picture',
    })
    expect(JSON.stringify(content)).not.toContain('iVBOR')
  })

  it('rejects missing files, path mismatch, unreferenced files and unknown asset or image fields', () => {
    expect(() =>
      decodeTrelyx(
        modifyContent((_content, entries) => {
          delete entries['assets/0/picture']
        }),
      ),
    ).toThrow(/缺失/)
    expect(() =>
      decodeTrelyx(
        modifyContent((content) => {
          assetOf(content).path = 'assets/0/attachment'
        }),
      ),
    ).toThrow(/路径/)
    expect(() =>
      decodeTrelyx(
        modifyContent((_content, entries) => {
          entries['assets/0/unused'] = strToU8('unused')
        }),
      ),
    ).toThrow(/附加内容/)
    expect(() =>
      decodeTrelyx(
        modifyContent((content) => {
          assetOf(content).extra = true
        }),
      ),
    ).toThrow(/不支持/)
    expect(() =>
      decodeTrelyx(
        modifyContent((content) => {
          ;(rootOf(content).image as Record<string, unknown>).extra = true
        }),
      ),
    ).toThrow(/不支持/)
    expect(() =>
      decodeTrelyx(
        modifyContent((content) => {
          rootOf(content).attachments = ['attachment', 'attachment']
        }),
      ),
    ).toThrow(/重复/)
    expect(() =>
      decodeTrelyx(
        modifyContent((content) => {
          rootOf(content).attachments = []
          delete rootOf(content).image
        }),
      ),
    ).toThrow(/未引用/)
  })

  it('verifies MIME, image signature, dimensions and individual asset size', () => {
    expect(() =>
      decodeTrelyx(
        modifyContent((content) => {
          assetOf(content).mimeType = 'text/html'
        }),
      ),
    ).toThrow(/类型/)
    expect(() =>
      decodeTrelyx(
        modifyContent((_content, entries) => {
          entries['assets/0/picture'] = strToU8('<svg/>')
        }),
      ),
    ).toThrow(/类型/)
    expect(() =>
      decodeTrelyx(
        modifyContent((content) => {
          ;(rootOf(content).image as Record<string, unknown>).width = 2
        }),
      ),
    ).toThrow(/尺寸/)
    expect(() =>
      decodeTrelyx(
        modifyContent((_content, entries) => {
          entries['assets/0/attachment'] = new Uint8Array(8 * 1024 * 1024 + 1)
        }),
      ),
    ).toThrow(/8 MiB/)
    const original = contentWorkbook()
    const sheet = original.sheets[0]
    const root = sheet?.document.topics.root
    if (!sheet || !root) throw new Error('Missing fixture root')
    const invalid = {
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
    }
    expect(() => encodeTrelyx(invalid)).toThrow(/尺寸/)
  })
})

describe('XMind embedded content', () => {
  it.each([false, true])(
    'imports actual embedded PNG/attachment and plain/rich notes (legacy %s)',
    (legacy) => {
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
      expect(decodeTrelyx(encodeTrelyx(workbook))).toEqual(workbook)
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
