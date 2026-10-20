import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createWorkbook, type DocumentAsset } from '@core'
import { createExport } from '@renderer/export/files'
import { prepareExportResources } from '@renderer/export/resources'
import { desktop } from '@tests/fixtures/desktop'
import type { ComputeAPI } from '@shared/compute'
import { layoutDocument } from '@layout'
import { prepareSheetImage } from '@renderer/export/images'
import { queryClient } from '@renderer/lib/queryClient'

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
  queryClient.clear()
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

it('leaves stored images on the native side and shares canvas/export geometry across color edits', async () => {
  const fetch = vi.fn(() =>
    Promise.reject(new Error('Renderer must not fetch native export assets')),
  )
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } })
  const asset: DocumentAsset = {
    id: 'native-image',
    name: 'large.png',
    mimeType: 'image/png',
    storage: {
      objectId: 'd'.repeat(64),
      byteLength: 100 * 1024 ** 2,
      width: 1000,
      height: 800,
      preview: {
        objectId: 'e'.repeat(64),
        byteLength: 256_000,
        mimeType: 'image/png',
        width: 1000,
        height: 800,
      },
    },
  }
  const document = applyCommand(createDocument('Native image', 'native-export-reference'), {
    type: 'setTopicImage',
    topicId: 'root',
    asset,
    width: 1000,
    height: 800,
  })
  const workbook = createWorkbook(document)
  const layout = vi.fn<ComputeAPI['layout']>((input) =>
    Promise.resolve(layoutDocument(input.document)),
  )
  const scene = { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', width: 200, height: 140 }
  const renderSheet = vi.fn<ComputeAPI['renderSheet']>(() => Promise.resolve(scene))
  desktop({ compute: { layout, renderSheet } as unknown as ComputeAPI })
  const sheetId = workbook.sheets[0]?.id ?? ''
  expect(await prepareSheetImage(workbook, sheetId)).toBe(scene)
  const received = renderSheet.mock.calls[0]?.[0].sheets[0]?.document.assets?.[asset.id]
  expect(received?.storage).toEqual(asset.storage)
  expect(received?.data).toBeUndefined()
  const recolored = createWorkbook(
    applyCommand(document, { type: 'setTopicStyle', topicId: 'root', style: { fill: '#112233' } }),
  )
  expect(await prepareSheetImage(recolored, sheetId)).toBe(scene)
  expect(layout).toHaveBeenCalledOnce()
  expect(renderSheet).toHaveBeenCalledTimes(2)
  expect(fetch).not.toHaveBeenCalled()
})
