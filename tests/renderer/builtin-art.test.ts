import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, deserializeWorkbook, serializeWorkbook } from '@core'
import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { insertBuiltinArt } from '@renderer/state/builtinArt'
import { builtinArtCatalogSchema, matchesArt } from '@shared/builtinArt'
import { fixtureArtAsset, fixtureArtCatalog } from '@tests/fixtures/builtinArt'
import { desktop } from '@tests/fixtures/desktop'

beforeEach(() => {
  useEditor.getState().replace(createDocument('素材'))
  useEditor.setState({ busy: false })
  useDocumentTabs.setState({ tabs: [], activeId: 'tab-art', recovery: [] })
})
describe('offline built-in artwork', () => {
  it('searches bilingual curated assets and rejects duplicate IDs', () => {
    expect(fixtureArtCatalog.items).toHaveLength(58)
    const camping = fixtureArtCatalog.items.find((item) => item.id === 'camping')
    expect(camping).toBeDefined()
    expect(camping && matchesArt(camping, '露营')).toBe(true)
    expect(camping && matchesArt(camping, 'camp outdoor')).toBe(true)
    expect(
      builtinArtCatalogSchema.safeParse({
        version: 1,
        licenseText: fixtureArtCatalog.licenseText,
        items: [camping, camping],
      }).success,
    ).toBe(false)
  })
  it('replaces an image in one undo and preserves embedded raster bytes through serialization', async () => {
    desktop()
    const state = useEditor.getState()
    const topicId = state.history.document.rootId
    await expect(insertBuiltinArt(topicId, 'camping')).resolves.toBe(true)
    await expect(insertBuiltinArt(topicId, 'cityscape')).resolves.toBe(true)
    const current = useEditor.getState()
    const document = current.history.document
    expect(document.topics[topicId]?.image?.assetId).toBe('builtin-art-v1-cityscape')
    const workbook = {
      ...current.workbook,
      sheets: current.workbook.sheets.map((sheet) =>
        sheet.id === current.activeSheetId ? { ...sheet, document } : sheet,
      ),
    }
    const reopened = deserializeWorkbook(serializeWorkbook(workbook)).sheets[0]?.document
    expect(reopened?.assets?.['builtin-art-v1-cityscape']).toEqual(fixtureArtAsset('cityscape'))
    current.undo()
    expect(useEditor.getState().history.document.topics[topicId]?.image?.assetId).toBe(
      'builtin-art-v1-camping',
    )
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.topics[topicId]?.image).toBeUndefined()
  })
  it.each(['tab', 'sheet', 'deleted'] as const)(
    'rejects completion after %s changes, including changing back',
    async (change) => {
      let complete: ((value: ReturnType<typeof fixtureArtAsset>) => void) | undefined
      desktop({
        getBuiltinArt: () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      })
      const state = useEditor.getState()
      const id = state.history.document.rootId
      const pending = insertBuiltinArt(id, 'camping')
      if (change === 'tab') {
        useDocumentTabs.setState({ activeId: 'another' })
        useDocumentTabs.setState({ activeId: 'tab-art' })
      } else if (change === 'sheet') {
        useEditor.setState({ activeSheetId: 'another' })
        useEditor.setState({ activeSheetId: state.activeSheetId })
      } else {
        useEditor.setState({
          history: { ...state.history, document: { ...state.history.document, topics: {} } },
        })
        useEditor.setState({ history: state.history })
      }
      complete?.(fixtureArtAsset('camping'))
      await expect(pending).resolves.toBe(false)
      expect(useEditor.getState().history.document.topics[id]?.image).toBeUndefined()
      expect(useEditor.getState().busy).toBe(false)
    },
  )
  it('blocks duplicate requests and releases busy state on failure', async () => {
    let reject: ((reason: Error) => void) | undefined
    const getBuiltinArt = vi.fn(
      () =>
        new Promise<ReturnType<typeof fixtureArtAsset>>((_resolve, rejectValue) => {
          reject = rejectValue
        }),
    )
    desktop({ getBuiltinArt })
    const id = useEditor.getState().history.document.rootId
    const pending = insertBuiltinArt(id, 'camping')
    await expect(insertBuiltinArt(id, 'camping')).resolves.toBe(false)
    expect(getBuiltinArt).toHaveBeenCalledOnce()
    reject?.(new Error('Could not render artwork'))
    await expect(pending).resolves.toBe(false)
    expect(useEditor.getState().busy).toBe(false)
    expect(useEditor.getState().error).toBe('Could not render artwork')
  })
})
