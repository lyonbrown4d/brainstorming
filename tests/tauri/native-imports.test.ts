import { describe, expect, it } from 'vitest'
import { deserializeWorkbook } from '@core'
import { normalizeOpenedDocument, serializeDroppedFiles } from '@renderer/lib/nativeImports'

const source = (name: string, text: string) => ({
  path: null,
  contents: '',
  importSource: { name, bytes: Array.from(new TextEncoder().encode(text)) },
})
describe('platform-neutral import boundary', () => {
  it('converts Markdown and OPML using the existing format modules', () => {
    const markdown = normalizeOpenedDocument(source('map.md', '# Map\n- Root\n  - Child'))
    expect(
      Object.values(
        deserializeWorkbook(markdown?.contents ?? '').sheets[0]?.document.topics ?? {},
      ).map((topic) => topic.title),
    ).toEqual(expect.arrayContaining(['Root', 'Child']))
    const opml = normalizeOpenedDocument(
      source(
        'map.opml',
        '<opml version="2.0"><body><outline text="Root"><outline text="Child"/></outline></body></opml>',
      ),
    )
    expect(
      Object.values(deserializeWorkbook(opml?.contents ?? '').sheets[0]?.document.topics ?? {}).map(
        (topic) => topic.title,
      ),
    ).toEqual(expect.arrayContaining(['Root', 'Child']))
  })
  it('serializes small HTML Files without depending on an Electron file path', async () => {
    const files = await serializeDroppedFiles([
      new File(['abc'], 'notes.txt', { type: 'text/plain' }),
    ])
    expect(files).toEqual([{ name: 'notes.txt', mimeType: 'text/plain', bytes: [97, 98, 99] }])
  })
  it('rejects aggregate HTML uploads above the bound before reading file bytes', async () => {
    const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.bin')
    await expect(serializeDroppedFiles([file])).rejects.toThrow('8 MiB')
  })
  it('rejects malformed UTF-8 and OPML instead of opening a partial document', () => {
    expect(() =>
      normalizeOpenedDocument({
        path: null,
        contents: '',
        importSource: { name: 'map.md', bytes: [255] },
      }),
    ).toThrow()
    expect(() => normalizeOpenedDocument(source('map.opml', '<broken>'))).toThrow()
  })
})
