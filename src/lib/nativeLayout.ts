import type { MindMapDocument, Topic } from '@core'
import type { QueryKey } from '@tanstack/react-query'
import { layoutDocument, measureTopic, type MindMapLayout } from '@layout'
import type { NativeLayoutInput } from '@shared/compute'
import { getPlatformAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import { boundNativeLayoutCache, estimateLayoutSource } from '@renderer/lib/nativeLayoutCache'

const layoutCache = boundNativeLayoutCache(queryClient)
import.meta.hot?.dispose(layoutCache.dispose)
export const touchNativeLayoutCache = (key: QueryKey): void => {
  layoutCache.touch(key)
}

const measuredTopics = new WeakMap<Topic, { width: number; height: number; root: boolean }>()

/** Topic objects are immutable across commands, so unchanged card measurements survive edits. */
export const layoutMeasurements = (document: MindMapDocument): NativeLayoutInput['measurements'] =>
  Object.values(document.topics).map((topic) => {
    let size = measuredTopics.get(topic)
    const root = topic.id === document.rootId
    if (size?.root !== root) {
      size = { ...measureTopic(topic.title, root, topic.style?.fontSize, topic), root }
      measuredTopics.set(topic, size)
    }
    return { id: topic.id, width: size.width, height: size.height }
  })

/** Only inputs capable of moving geometry participate in the cache key. */
export const layoutIdentity = (
  document: MindMapDocument,
  measurements: NativeLayoutInput['measurements'],
): string => {
  const sizeById = new Map(measurements.map((size) => [size.id, size]))
  return JSON.stringify({
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
      width: sizeById.get(topic.id)?.width,
      height: sizeById.get(topic.id)?.height,
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
}

export const nativeLayoutQuery = (
  document: MindMapDocument,
  sheetId: string,
  measurements: NativeLayoutInput['measurements'] = layoutMeasurements(document),
) => {
  return {
    queryKey: ['canvas-layout', sheetId, document.id, layoutIdentity(document, measurements)],
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
  measurements: NativeLayoutInput['measurements'] = layoutMeasurements(document),
): Promise<MindMapLayout> => {
  const options = nativeLayoutQuery(document, sheetId, measurements)
  const layout = await queryClient.query(options)
  layoutCache.touch(options.queryKey)
  return layout
}

export const computeNativeLayout = async (
  document: MindMapDocument,
  measurements: NativeLayoutInput['measurements'] = layoutMeasurements(document),
): Promise<MindMapLayout> => {
  const api = getPlatformAPI()
  if (!api) throw new Error('Brainstorming 原生平台尚未初始化。')
  // Component previews explicitly inject an API without the native compute service.
  if (!api.compute) return layoutDocument(document)
  const compute = api.compute
  return compute.layout({ document, measurements })
}
