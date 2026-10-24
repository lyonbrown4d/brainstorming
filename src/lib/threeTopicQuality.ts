import { Group, type WebGLRenderer } from 'three'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import {
  createThreeTopicRasterCache,
  prepareThreeTopicAtlas,
  type ThreeTopicAtlas,
} from '@renderer/lib/threeTopicAtlas'
import { createThreeTopicBatches } from '@renderer/lib/threeTopicBatch'
import {
  planThreeTopicQuality,
  TOPIC_DETAIL_CACHE_PIXELS,
} from '@renderer/lib/threeTopicQualityPlan'
import { createThreeTopicQualityQueue } from '@renderer/lib/threeTopicQualityQueue'

interface TopicQualityOptions {
  readonly runtime: IndependentSpatialRuntime
  readonly overview: ThreeTopicAtlas
  readonly base: Pick<ReturnType<typeof createThreeTopicBatches>, 'setExcluded'>
  readonly host: Group
  readonly renderer: Pick<WebGLRenderer, 'initTexture'>
  readonly selected: () => ReadonlySet<string>
}

/** A single 2048² detail page supplements the overview without changing navigation work. */
export const createThreeTopicQuality = ({
  runtime,
  overview,
  base,
  host,
  renderer,
  selected,
}: TopicQualityOptions) => {
  const cache = createThreeTopicRasterCache(TOPIC_DETAIL_CACHE_PIXELS)
  const detailHost = new Group()
  host.add(detailHost)
  let active: {
    atlas: ThreeTopicAtlas
    batches: ReturnType<typeof createThreeTopicBatches>
    key: string
  } | null = null
  let disposed = false
  const clear = () => {
    if (!active) return
    base.setExcluded(new Set())
    detailHost.clear()
    active.batches.dispose()
    active.atlas.dispose()
    active = null
    runtime.invalidate()
  }
  const queue = createThreeTopicQualityQueue(async (signal) => {
    const cancelled = () => signal.aborted || disposed
    if (cancelled() || !runtime.canvas) return
    if (runtime.navigating || runtime.interacting) {
      queue.request()
      return
    }
    const viewport = runtime.canvas.getBoundingClientRect()
    const plan = planThreeTopicQuality(
      runtime.model.layout.nodes,
      overview.tiles,
      runtime.rectangles().filter((rect) => !runtime.hiddenTopics.has(rect.id)),
      {
        x: viewport.left,
        y: viewport.top,
        width: viewport.width,
        height: viewport.height,
        pixelRatio: runtime.canvas.width / Math.max(1, viewport.width),
      },
      selected(),
    )
    const key = plan.map((tile) => `${tile.id}:${tile.pixelWidth}:${tile.pixelHeight}`).join('/')
    if (active?.key === key) return
    if (!plan.length) {
      clear()
      return
    }
    let atlas: ThreeTopicAtlas | null = null
    let batches: ReturnType<typeof createThreeTopicBatches> | null = null
    try {
      atlas = await prepareThreeTopicAtlas(runtime.model, cache, signal, plan)
      if (!atlas) return
      if (cancelled()) {
        atlas.dispose()
        return
      }
      clear()
      for (const texture of atlas.textures) renderer.initTexture(texture)
      batches = createThreeTopicBatches(atlas, runtime)
      batches.update(selected())
      detailHost.add(...batches.meshes)
      base.setExcluded(new Set(plan.map((tile) => tile.id)))
      active = { atlas, batches, key }
      runtime.invalidate()
    } catch {
      batches?.dispose()
      atlas?.dispose()
      // Keep the working overview if a device cannot allocate a detail page.
    }
  })
  return {
    request: queue.request,
    invalidate: () => {
      queue.request()
      clear()
    },
    updateSelection: () => {
      active?.batches.updateSelection(selected())
      queue.request()
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      queue.dispose()
      clear()
      host.remove(detailHost)
      cache.clear()
    },
  }
}
