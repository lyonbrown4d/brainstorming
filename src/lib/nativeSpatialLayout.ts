import type { MindMapDocument } from '@core'
import { layoutDocument } from '@layout'
import type { NativeLayoutInput, NativeSpatialLayout } from '@shared/compute'
import { getPlatformAPI } from '@renderer/lib/desktop'
import {
  layoutIdentity,
  layoutMeasurements,
  touchNativeLayoutCache,
} from '@renderer/lib/nativeLayout'
import { estimateLayoutSource } from '@renderer/lib/nativeLayoutCache'
import { queryClient } from '@renderer/lib/queryClient'
import { spatialTopicOffsets } from '@renderer/lib/spatialProjection'
import type { SpatialView } from '@renderer/state/spatialView'

const spatialIdentity = (document: MindMapDocument, view: SpatialView): string =>
  JSON.stringify({
    spacing: view.spacing,
    depths: Object.values(document.topics).map((topic) => [
      topic.id,
      topic.style?.spatialDepth ?? 0,
    ]),
  })

export const nativeSpatialLayoutQuery = (
  document: MindMapDocument,
  sheetId: string,
  view: SpatialView,
  measurements: NativeLayoutInput['measurements'] = layoutMeasurements(document),
) => ({
  queryKey: [
    'canvas-spatial-layout',
    sheetId,
    document.id,
    layoutIdentity(document, measurements),
    spatialIdentity(document, view),
  ],
  queryFn: () => computeNativeSpatialLayout(document, view, measurements),
  staleTime: Infinity,
  gcTime: 5 * 60_000,
  meta: { layoutSourceBytes: estimateLayoutSource(document) },
})

export const fetchNativeSpatialLayout = async (
  document: MindMapDocument,
  sheetId: string,
  view: SpatialView,
  measurements: NativeLayoutInput['measurements'] = layoutMeasurements(document),
): Promise<NativeSpatialLayout> => {
  const options = nativeSpatialLayoutQuery(document, sheetId, view, measurements)
  const result = await queryClient.query(options)
  touchNativeLayoutCache(options.queryKey)
  return result
}

export const computeNativeSpatialLayout = async (
  document: MindMapDocument,
  view: SpatialView,
  measurements: NativeLayoutInput['measurements'] = layoutMeasurements(document),
): Promise<NativeSpatialLayout> => {
  const api = getPlatformAPI()
  if (!api) throw new Error('Brainstorming 原生平台尚未初始化。')
  // Storybook explicitly injects a platform API without the native compute service.
  if (!api.compute)
    return {
      layout: layoutDocument(document),
      depths: Object.fromEntries(
        [...spatialTopicOffsets(document, view)].map(([id, offset]) => [id, offset.z]),
      ),
    }
  const inputDocument: MindMapDocument = {
    ...document,
    settings: { ...document.settings, spatial: view },
  }
  return api.compute.spatialLayout({ document: inputDocument, measurements })
}
