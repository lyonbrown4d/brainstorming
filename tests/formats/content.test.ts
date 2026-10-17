import { readFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { deserializeWorkbook, serializeWorkbook } from '@core'
import { importXmind } from '@formats/xmind'
import { contentXmind } from '@tests/fixtures/xmind/archive'

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/xmind/${name}`, import.meta.url)))

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
      expect(deserializeWorkbook(serializeWorkbook(workbook))).toEqual(workbook)
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
