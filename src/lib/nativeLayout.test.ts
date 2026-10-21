import { expect, it, vi } from 'vitest'
import { createFixtureDocument, type Topic } from '@core'
import type { MindMapLayout } from '@layout'
import type { DesktopAPI } from '@shared/contracts'
import { installPlatformAPI } from '@renderer/lib/desktop'
import {
  computeNativeLayout,
  layoutIdentity,
  layoutMeasurements,
  nativeLayoutQuery,
  nativeMeasurements,
} from '@renderer/lib/nativeLayout'
import {
  computeNativeSpatialLayout,
  nativeSpatialLayoutQuery,
} from '@renderer/lib/nativeSpatialLayout'
import type { SpatialView } from '@renderer/state/spatialView'

const view: SpatialView = { mode: '3d', yaw: 0, pitch: 0, spacing: 100 }

it('uses native whole-map measurement for 2D, 3D, and resize queries', async () => {
  const document = createFixtureDocument(3)
  const layout: MindMapLayout = { nodes: [], edges: [] }
  const compute = {
    layout: vi.fn(() => Promise.resolve(layout)),
    spatialLayout: vi.fn(() => Promise.resolve({ layout, depths: {} })),
  }
  const restore = installPlatformAPI({ compute } as unknown as DesktopAPI)
  try {
    const measurements = nativeMeasurements(document)
    expect(measurements).toEqual([])
    expect(nativeMeasurements(document)).toBe(measurements)
    expect(nativeLayoutQuery(document, 'sheet').queryKey).toEqual(
      nativeLayoutQuery(document, 'sheet', measurements).queryKey,
    )
    expect(nativeSpatialLayoutQuery(document, 'sheet', view).queryKey).toEqual(
      nativeSpatialLayoutQuery(document, 'sheet', view, measurements).queryKey,
    )
    await computeNativeLayout(document)
    await computeNativeSpatialLayout(document, view)
    await computeNativeSpatialLayout(document, { ...view, cameraDistance: 1000 })
    expect(compute.layout).toHaveBeenCalledWith({ document, measurements: [] })
    expect(compute.spatialLayout).toHaveBeenLastCalledWith({
      document: { ...document, settings: { ...document.settings, spatial: view } },
      measurements: [],
    })
    const explicit = [{ id: document.rootId, width: 321, height: 123 }]
    await computeNativeLayout(document, explicit)
    expect(compute.layout).toHaveBeenLastCalledWith({ document, measurements: explicit })
  } finally {
    restore()
  }
})

it('retains memoized frontend reference measurements without native compute', () => {
  const document = createFixtureDocument(3)
  const restore = installPlatformAPI({} as DesktopAPI)
  try {
    expect(nativeMeasurements(document)).toBe(layoutMeasurements(document))
    expect(nativeMeasurements(document)).toHaveLength(3)
  } finally {
    restore()
  }
})

it('keys native sizes by every raw input that can change topic bounds', () => {
  const document = createFixtureDocument(2)
  const root = document.topics.root
  if (!root) throw new Error('missing fixture root')
  const key = (topic: Topic): string =>
    layoutIdentity({ ...document, topics: { ...document.topics, root: topic } }, [])
  const base = key(root)
  const changes: Topic[] = [
    { ...root, title: 'Another title' },
    { ...root, style: { shape: 'circle' } },
    { ...root, style: { fontSize: 32 } },
    { ...root, style: { scale: 1.5 } },
    { ...root, style: { width: 280 } },
    { ...root, image: { assetId: 'image', width: 320, height: 160 } },
    { ...root, notes: 'A note' },
    { ...root, attachments: ['asset'] },
    { ...root, metadata: { markers: ['star'] } },
    { ...root, metadata: { labels: ['label'] } },
  ]
  for (const changed of changes) expect(key(changed)).not.toBe(base)
  const marked = { ...root, metadata: { markers: ['star'] } }
  expect(key({ ...marked, metadata: { markers: ['star', 'flag'] } })).not.toBe(key(marked))
  expect(key({ ...marked, metadata: { ...marked.metadata, markerStyle: { size: 24 } } })).not.toBe(
    key(marked),
  )
  expect(
    key({ ...marked, metadata: { ...marked.metadata, markerStyle: { position: 'left' } } }),
  ).not.toBe(key(marked))
})

it('ignores content and camera edits that leave measured geometry unchanged', () => {
  const document = createFixtureDocument(2)
  const root = document.topics.root
  if (!root) throw new Error('missing fixture root')
  const topic: Topic = {
    ...root,
    notes: 'before',
    attachments: ['asset-a'],
    image: { assetId: 'image-a', width: 320, height: 160 },
    metadata: { labels: ['first'], markers: ['star'] },
  }
  const baseDocument = { ...document, topics: { ...document.topics, root: topic } }
  const base = layoutIdentity(baseDocument, [])
  const changed: Topic = {
    ...topic,
    notes: 'after',
    attachments: ['asset-b'],
    image: { assetId: 'image-b', width: 320, height: 160 },
    metadata: { labels: ['second'], markers: ['flag'] },
    style: { fill: '#123456', color: '#ffffff', spatialDepth: 45 },
  }
  expect(
    layoutIdentity({ ...baseDocument, topics: { ...baseDocument.topics, root: changed } }, []),
  ).toBe(base)
  expect(
    layoutIdentity({ ...baseDocument, settings: { ...baseDocument.settings, spatial: view } }, []),
  ).toBe(base)
  const explicit = layoutMeasurements(baseDocument)
  expect(layoutIdentity(baseDocument, explicit)).toBe(layoutIdentity(baseDocument, explicit))
})
