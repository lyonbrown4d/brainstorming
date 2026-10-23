import { isEqual } from 'lodash-es'
import type { SpatialSceneModel } from '@renderer/lib/independentSpatialRuntime'

/** Camera persistence changes the native snapshot, but none of these renderer inputs. */
const visualModel = ({ document, layout, depths, surface }: SpatialSceneModel) => ({
  rootId: document.rootId,
  topics: document.topics,
  floatingIds: document.floatingIds,
  assets: document.assets,
  drawings: document.drawings,
  groups: document.groups,
  callouts: document.callouts,
  relations: document.relations,
  settings: {
    visualStyle: document.settings?.visualStyle,
    layout: document.settings?.layout,
    theme: document.settings?.theme,
    customPalette: document.settings?.customPalette,
    background: document.settings?.background,
    fontFamily: document.settings?.fontFamily,
    lineWidth: document.settings?.lineWidth,
  },
  layout,
  depths,
  surface,
})

interface SceneModelCacheOptions {
  readonly prepare: (model: SpatialSceneModel, complete: (success: boolean) => void) => void
  readonly reuse: () => void
}

/** Retain only the prepared and pending models; equality runs on model notifications only. */
export const createThreeSceneModelCache = ({ prepare, reuse }: SceneModelCacheOptions) => {
  let prepared: ReturnType<typeof visualModel> | null = null
  let pending: ReturnType<typeof visualModel> | null = null
  let revision = 0
  return {
    update: (model: SpatialSceneModel) => {
      const next = visualModel(model)
      if (prepared && isEqual(prepared, next)) {
        revision++
        pending = null
        reuse()
        return
      }
      if (pending && isEqual(pending, next)) return
      const request = ++revision
      pending = next
      prepare(model, (success) => {
        if (request !== revision) return
        pending = null
        if (success) prepared = next
      })
    },
    clear: () => {
      revision++
      prepared = null
      pending = null
    },
  }
}
