import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createWorkbook, type DocumentAsset } from '@core'
import { createExport } from '@renderer/export/files'
import { prepareExportResources } from '@renderer/export/resources'
import { desktop } from '@tests/fixtures/desktop'

const storedAttachment: DocumentAsset = {
  id: 'video',
  name: 'large.mp4',
  mimeType: 'video/mp4',
  storage: { objectId: 'a'.repeat(64), byteLength: 4 * 1024 ** 3 },
}
const withAttachment = () =>
  createWorkbook(
    applyCommand(createDocument('Large resource'), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: storedAttachment,
    }),
  )
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bounded resource interchange exports', () => {
  it.each(['md', 'opml', 'txt'] as const)(
    '%s exports do not materialize attached media',
    async (format) => {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      const book = withAttachment()
      const request = await createExport(book, { format, sheetId: book.sheets[0]?.id ?? '' })
      expect(new TextDecoder().decode(request.bytes)).toContain('Large resource')
      expect(fetch).not.toHaveBeenCalled()
    },
  )
  it('visual exports hydrate only displayed image previews, retaining large attachment references', async () => {
    const bytes = readFileSync(new URL('../fixtures/xmind/pixel image.png', import.meta.url))
    const fetch = vi.fn(() => Promise.resolve(new Response(bytes)))
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('window', { brainstorming: desktop() })
    const original = withAttachment()
    const sheet = original.sheets[0]
    if (!sheet) throw new Error('Missing sheet')
    const image: DocumentAsset = {
      id: 'image',
      name: 'large.png',
      mimeType: 'image/png',
      storage: {
        objectId: 'b'.repeat(64),
        byteLength: 100 * 1024 ** 2,
        width: 1,
        height: 1,
        preview: {
          objectId: 'c'.repeat(64),
          byteLength: bytes.length,
          mimeType: 'image/png',
          width: 1,
          height: 1,
        },
      },
    }
    const book = {
      ...original,
      sheets: [
        {
          ...sheet,
          document: applyCommand(sheet.document, {
            type: 'setTopicImage',
            topicId: 'root',
            asset: image,
            width: 1,
            height: 1,
          }),
        },
      ],
    }
    const prepared = await prepareExportResources(book, false)
    expect(prepared.sheets[0]?.document.assets?.video).toEqual(storedAttachment)
    expect(prepared.sheets[0]?.document.assets?.image?.data).toBe(bytes.toString('base64'))
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`http://127.0.0.1:43123/object/${'c'.repeat(64)}`)
    expect(book.sheets[0]?.document.assets?.image?.storage?.byteLength).toBe(100 * 1024 ** 2)
  })
  it('ignores unused resource descriptors during XMind export', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const original = withAttachment()
    const sheet = original.sheets[0]
    if (!sheet) throw new Error('Missing sheet')
    const withoutAttachment = applyCommand(sheet.document, {
      type: 'removeTopicAttachment',
      topicId: 'root',
      assetId: storedAttachment.id,
    })
    const workbook = {
      ...original,
      sheets: [
        {
          ...sheet,
          document: {
            ...withoutAttachment,
            assets: { video: storedAttachment },
          },
        },
      ],
    }
    const exported = await createExport(workbook, { format: 'xmind', sheetId: sheet.id })
    expect(exported.bytes[0]).toBe(80)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects oversized original resources before fetching an XMind export', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(prepareExportResources(withAttachment(), true)).rejects.toThrow('8 MiB')
    expect(fetch).not.toHaveBeenCalled()
  })
})
