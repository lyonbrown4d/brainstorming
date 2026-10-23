import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'
import { LRUCache } from 'lru-cache'
import { asyncScheduler, firstValueFrom, scheduled } from 'rxjs'
import type { SpatialSceneModel } from '@renderer/lib/independentSpatialRuntime'
import {
  TOPIC_ATLAS_SIZE,
  packTopicAtlas,
  type TopicAtlasTile,
} from '@renderer/lib/threeTopicAtlasLayout'
import { threeTopicAssetKey } from '@renderer/lib/threeTopicAssetKey'
import { paintThreeTopic } from '@renderer/lib/threeTopicPaint'
import { topicAppearance } from '@shared/appearance'
import { prepareMarkerIcons } from '@shared/markerIcons'

export interface ThreeTopicAtlas {
  readonly tiles: readonly TopicAtlasTile[]
  readonly textures: readonly CanvasTexture[]
  readonly dispose: () => void
}

/** Only the current renderer owns cached rasters, with a hard eight-million-pixel bound. */
export const createThreeTopicRasterCache = (maxPixels = 8 * 1024 * 1024) =>
  new LRUCache<string, HTMLCanvasElement>({
    max: 2048,
    maxSize: maxPixels,
    sizeCalculation: (canvas) => canvas.width * canvas.height,
    dispose: (canvas) => {
      canvas.width = 0
      canvas.height = 0
    },
  })

export const prepareThreeTopicAtlas = async (
  model: SpatialSceneModel,
  cache: ReturnType<typeof createThreeTopicRasterCache>,
  signal: AbortSignal,
  plannedTiles?: readonly TopicAtlasTile[],
): Promise<ThreeTopicAtlas | null> => {
  const cancelled = () => signal.aborted
  const tiles = plannedTiles ?? packTopicAtlas(model.layout.nodes)
  const canvases = Array.from({ length: (tiles.at(-1)?.page ?? -1) + 1 }, () => {
    const canvas = document.createElement('canvas')
    canvas.width = TOPIC_ATLAS_SIZE
    canvas.height = TOPIC_ATLAS_SIZE
    return canvas
  })
  const releaseCanvases = () => {
    for (const canvas of canvases) {
      canvas.width = 0
      canvas.height = 0
    }
  }
  try {
    const contexts = canvases.map((canvas) => {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Unable to create topic atlas drawing context')
      return context
    })
    await prepareMarkerIcons(model.document)
    if (cancelled()) {
      releaseCanvases()
      return null
    }
    for (const [index, tile] of tiles.entries()) {
      if (cancelled()) {
        releaseCanvases()
        return null
      }
      const topic = model.document.topics[tile.id]
      const target = contexts[tile.page]
      if (!topic || !target) continue
      const appearance = topicAppearance(model.document, tile.id, model.surface)
      const key = JSON.stringify([
        topic,
        topic.id === model.document.rootId,
        model.document.topics[model.document.rootId]?.children.includes(topic.id),
        appearance,
        tile.width,
        tile.height,
        tile.pixelWidth,
        tile.pixelHeight,
        model.document.settings?.visualStyle,
        threeTopicAssetKey(model.document.assets?.[topic.image?.assetId ?? '']),
      ])
      let raster = cache.get(key)
      if (!raster) {
        raster = document.createElement('canvas')
        raster.width = tile.pixelWidth
        raster.height = tile.pixelHeight
        const context = raster.getContext('2d')
        if (!context) throw new Error('Unable to create topic raster drawing context')
        context.scale(tile.pixelWidth / (tile.width + 8), tile.pixelHeight / (tile.height + 8))
        context.translate(4, 4)
        await paintThreeTopic(context, model, topic, tile.width, tile.height, signal)
        if (cancelled()) {
          releaseCanvases()
          return null
        }
        cache.set(key, raster)
      }
      target.drawImage(raster, tile.x, tile.y)
      if ((index + 1) % (plannedTiles ? 4 : 24) === 0)
        await firstValueFrom(scheduled([undefined], asyncScheduler))
    }
    if (cancelled()) {
      releaseCanvases()
      return null
    }
    const textures = canvases.map((canvas) => {
      const texture = new CanvasTexture(canvas)
      texture.colorSpace = SRGBColorSpace
      texture.minFilter = LinearFilter
      texture.magFilter = LinearFilter
      texture.generateMipmaps = false
      return texture
    })
    return {
      tiles,
      textures,
      dispose: () => {
        textures.forEach((texture) => {
          texture.dispose()
        })
        releaseCanvases()
      },
    }
  } catch (error) {
    releaseCanvases()
    throw error
  }
}
