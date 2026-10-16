import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '../../src/core'
import { brandMarkerIcon, brandMarkerNames, prepareMarkerIcons } from '../../src/shared/markerIcons'
import { renderSheetSvg } from '../../src/renderer/src/export/svg'
import { useEditor } from '../../src/renderer/src/state/editor'
import {
  setMetadataField,
  toggleTopicMarker,
} from '../../src/renderer/src/components/metadata/commands'

beforeEach(() => {
  useEditor.getState().replace(createDocument('图标测试'))
  vi.stubGlobal('window', { trelyx: undefined })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('offline topic markers', () => {
  it('loads bundled brand vectors and safely rejects unknown identifiers without a network lookup', async () => {
    const fetch = vi.fn(() => Promise.reject(new Error('Offline')))
    vi.stubGlobal('fetch', fetch)
    const document = useEditor.getState().history.document
    const root = document.topics[document.rootId]
    if (!root) throw new Error('缺少中心主题')
    const marked = {
      ...document,
      topics: {
        ...document.topics,
        [document.rootId]: {
          ...root,
          metadata: { markers: ['simple-icons:github'] },
        },
      },
    }
    await prepareMarkerIcons(marked)
    const github = brandMarkerIcon('simple-icons:github')
    expect(github?.body).toContain('<path')
    expect(github?.width).toBeGreaterThan(0)
    expect(brandMarkerNames()).toContain('simple-icons:github')
    expect(brandMarkerNames().every((name) => name.length <= 64)).toBe(true)
    expect(brandMarkerIcon('simple-icons:unknown-trelyx-icon')).toBeUndefined()
    expect(brandMarkerIcon('__proto__')).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    const exported = renderSheetSvg(marked).svg
    expect(exported).toContain('data-marker="simple-icons:github"')
    expect(exported).toContain('viewBox="0 0 24 24"')
    const overflow = {
      ...marked,
      topics: {
        ...marked.topics,
        [root.id]: {
          ...root,
          metadata: {
            markers: [
              'simple-icons:github',
              'simple-icons:gitlab',
              'simple-icons:npm',
              'simple-icons:react',
              'simple-icons:vite',
            ],
          },
        },
      },
    }
    const withOverflow = renderSheetSvg(overflow).svg
    expect(withOverflow.match(/data-marker=/g)).toHaveLength(4)
    expect(withOverflow).toContain('+1')
    expect(withOverflow).toContain('simple-icons:vite')
  })

  it('toggles one marker per undo while preserving labels and advanced task fields', () => {
    const id = useEditor.getState().selectedId
    setMetadataField(id, 'labels', ['计划'])
    setMetadataField(id, 'task', { done: false, priority: 2, due: '2027-01-01', assignee: '设计' })
    const before = useEditor.getState().history.document.topics[id]?.metadata
    expect(toggleTopicMarker(id, 'simple-icons:github')).toBe(true)
    expect(useEditor.getState().history.document.topics[id]?.metadata).toEqual({
      ...before,
      markers: ['simple-icons:github'],
    })
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.topics[id]?.metadata).toEqual(before)
  })

  it('rejects a 33rd or oversized marker without mutation and still permits removal', () => {
    const id = useEditor.getState().selectedId
    const markers = Array.from({ length: 32 }, (_, index) => `marker-${index}`)
    setMetadataField(id, 'markers', markers)
    const before = useEditor.getState().history.document
    expect(toggleTopicMarker(id, 'simple-icons:github')).toBe(false)
    expect(toggleTopicMarker(id, 'x'.repeat(65))).toBe(false)
    expect(useEditor.getState().history.document).toBe(before)
    expect(toggleTopicMarker(id, 'marker-0')).toBe(true)
    expect(useEditor.getState().history.document.topics[id]?.metadata?.markers).toHaveLength(31)
  })
})
