import type { MindMapDocument, Topic } from '@core'
import type { QueryKey } from '@tanstack/react-query'
import { layoutDocument, measureTopic, type MindMapLayout } from '@layout'
import type { NativeLayoutInput } from '@shared/compute'
import { getPlatformAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import { hashNativeLayoutKey } from '@renderer/lib/nativeLayoutQueryKey'
import { boundNativeLayoutCache, estimateLayoutSource } from '@renderer/lib/nativeLayoutCache'

const layoutCache = boundNativeLayoutCache(queryClient)
import.meta.hot?.dispose(layoutCache.dispose)
export const touchNativeLayoutCache = (key: QueryKey): void => {
  layoutCache.touch(key)
}

const measuredTopics = new WeakMap<Topic, { width: number; height: number; root: boolean }>()
const measuredDocuments = new WeakMap<MindMapDocument, NativeLayoutInput['measurements']>()
const identityCache = new WeakMap<MindMapDocument, WeakMap<object, string>>()
const emptyMeasurements: NativeLayoutInput['measurements'] = Object.freeze([])

/** Topic objects are immutable across commands, so unchanged card measurements survive edits. */
export const layoutMeasurements = (
  document: MindMapDocument,
): NativeLayoutInput['measurements'] => {
  const cached = measuredDocuments.get(document)
  if (cached) return cached
  const measurements = Object.values(document.topics).map((topic) => {
    let size = measuredTopics.get(topic)
    const root = topic.id === document.rootId
    if (size?.root !== root) {
      size = { ...measureTopic(topic.title, root, topic.style?.fontSize, topic), root }
      measuredTopics.set(topic, size)
    }
    return { id: topic.id, width: size.width, height: size.height }
  })
  measuredDocuments.set(document, measurements)
  return measurements
}

/** Native layout measures the whole map; component previews retain the TS reference path. */
export const nativeMeasurements = (document: MindMapDocument): NativeLayoutInput['measurements'] =>
  getPlatformAPI()?.compute ? emptyMeasurements : layoutMeasurements(document)

/** Only inputs capable of moving geometry participate in the cache key. */
export const layoutIdentity = (
  document: MindMapDocument,
  measurements: NativeLayoutInput['measurements'],
): string => {
  let byMeasurements = identityCache.get(document)
  const cached = byMeasurements?.get(measurements)
  if (cached) return cached
  const nativeMeasure = measurements.length === 0
  const sizeById = nativeMeasure ? undefined : new Map(measurements.map((size) => [size.id, size]))
  const identity = JSON.stringify({
    rootId: document.rootId,
    layout: document.settings?.layout ?? 'map',
    topics: Object.values(document.topics).map((topic) => ({
      id: topic.id,
      children: topic.children,
      side: topic.side,
      collapsed: topic.collapsed,
      structure: topic.structure,
      offsetX: topic.style?.offsetX ?? 0,
      offsetY: topic.style?.offsetY ?? 0,
      width: sizeById?.get(topic.id)?.width,
      height: sizeById?.get(topic.id)?.height,
      ...(nativeMeasure
        ? {
            title: topic.title,
            shape: topic.style?.shape,
            fontSize: topic.style?.fontSize,
            fixedWidth: topic.style?.width,
            scale: topic.style?.scale,
            image: topic.image && [topic.image.width, topic.image.height],
            details: [topic.notes, topic.attachments?.length].some(Boolean),
            notes: Boolean(topic.notes),
            markers: topic.metadata?.markers?.length
              ? [
                  topic.metadata.markers.length,
                  topic.metadata.markerStyle?.position ?? 'bottom',
                  topic.metadata.markerStyle?.size ?? 16,
                ]
              : undefined,
            badge: [
              topic.metadata?.labels?.length,
              topic.metadata?.link,
              topic.metadata?.task,
              topic.metadata?.equation,
              topic.metadata?.audioAssetId,
            ].some(Boolean),
          }
        : {}),
    })),
    floatingIds: document.floatingIds ?? [],
    floatingPositions: document.floatingPositions ?? {},
    summaries:
      document.groups
        ?.filter((group) => group.kind === 'summary')
        .map((group) => ({
          topicIds: group.topicIds,
          summaryTopicId: group.summaryTopicId,
        })) ?? [],
  })
  byMeasurements ??= new WeakMap<object, string>()
  byMeasurements.set(measurements, identity)
  identityCache.set(document, byMeasurements)
  return identity
}

export const nativeLayoutQuery = (
  document: MindMapDocument,
  sheetId: string,
  measurements: NativeLayoutInput['measurements'] = nativeMeasurements(document),
) => {
  return {
    queryKey: Object.freeze([
      'canvas-layout',
      sheetId,
      document.id,
      layoutIdentity(document, measurements),
    ] as const),
    queryKeyHashFn: hashNativeLayoutKey,
    queryFn: () => computeNativeLayout(document, measurements),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    meta: { layoutSourceBytes: estimateLayoutSource(document) },
  } as const
}

/** Export and previews share the exact geometry already computed for the canvas. */
export const fetchNativeLayout = async (
  document: MindMapDocument,
  sheetId: string,
  measurements: NativeLayoutInput['measurements'] = nativeMeasurements(document),
): Promise<MindMapLayout> => {
  const options = nativeLayoutQuery(document, sheetId, measurements)
  const layout = await queryClient.query(options)
  layoutCache.touch(options.queryKey)
  return layout
}

export const computeNativeLayout = async (
  document: MindMapDocument,
  measurements: NativeLayoutInput['measurements'] = nativeMeasurements(document),
): Promise<MindMapLayout> => {
  const api = getPlatformAPI()
  if (!api) throw new Error('Brainstorming 原生平台尚未初始化。')
  // Component previews explicitly inject an API without the native compute service.
  if (!api.compute) return layoutDocument(document)
  const compute = api.compute
  return compute.layout({ document, measurements })
}
