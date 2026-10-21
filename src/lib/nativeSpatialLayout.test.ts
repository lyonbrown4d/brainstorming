import { expect, it } from 'vitest'
import { createFixtureDocument } from '@core'
import { nativeSpatialLayoutQuery } from '@renderer/lib/nativeSpatialLayout'
import type { SpatialView } from '@renderer/state/spatialView'

const view: SpatialView = { mode: '3d', yaw: 0.7, pitch: 0.5, spacing: 100 }

it('keys native spatial results by geometry, depth overrides, and spacing', () => {
  const document = createFixtureDocument(6)
  const base = nativeSpatialLayoutQuery(document, 'sheet', view).queryKey
  const rotated = nativeSpatialLayoutQuery(document, 'sheet', {
    ...view,
    yaw: -0.3,
    pitch: 0.8,
    mode: '2d',
  }).queryKey
  expect(rotated).toEqual(base)
  expect(
    nativeSpatialLayoutQuery(document, 'sheet', { ...view, spacing: 120 }).queryKey,
  ).not.toEqual(base)
  const topic = document.topics['topic-1']
  const root = document.topics.root
  if (!topic || !root) throw new Error('missing fixture topic')
  const depthChanged = {
    ...document,
    topics: { ...document.topics, 'topic-1': { ...topic, style: { spatialDepth: 50 } } },
  }
  expect(nativeSpatialLayoutQuery(depthChanged, 'sheet', view).queryKey).not.toEqual(base)
  const topologyChanged = {
    ...document,
    topics: { ...document.topics, root: { ...root, children: [...root.children].reverse() } },
  }
  expect(nativeSpatialLayoutQuery(topologyChanged, 'sheet', view).queryKey).not.toEqual(base)
})
