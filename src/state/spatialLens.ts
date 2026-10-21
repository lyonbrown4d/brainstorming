import { create } from 'zustand'
import type { SpatialSettings } from '@core'
import type { SpatialView } from '@renderer/state/spatialView'

const MAX_LENSES = 16
const MAX_MERGES_PER_VIEW = 8
const merged = new WeakMap<SpatialSettings, Map<number, SpatialView>>()

export const spatialLensKey = (workbookId: string, sheetId: string): string =>
  JSON.stringify([workbookId, sheetId])

interface SpatialLensState {
  readonly distances: Readonly<Record<string, number>>
  readonly order: readonly string[]
  setDistance: (workbookId: string, sheetId: string, distance?: number) => void
}

/** Camera distance belongs to the renderer session, never to a document command. */
export const useSpatialLens = create<SpatialLensState>((set) => ({
  distances: {},
  order: [],
  setDistance: (workbookId, sheetId, distance) => {
    if (distance !== undefined && (!Number.isFinite(distance) || distance <= 0)) return
    const key = spatialLensKey(workbookId, sheetId)
    set((state) => {
      if (state.distances[key] === distance) return state
      if (distance === undefined) {
        const distances = Object.fromEntries(
          Object.entries(state.distances).filter(([entry]) => entry !== key),
        )
        return { distances, order: state.order.filter((entry) => entry !== key) }
      }
      const order = [...state.order.filter((entry) => entry !== key), key]
      while (order.length > MAX_LENSES) order.shift()
      const allowed = new Set(order)
      const distances = Object.fromEntries(
        Object.entries({ ...state.distances, [key]: distance }).filter(([entry]) =>
          allowed.has(entry),
        ),
      )
      return { distances, order }
    })
  },
}))

export const setSpatialLens = (workbookId: string, sheetId: string, distance?: number): void => {
  useSpatialLens.getState().setDistance(workbookId, sheetId, distance)
}

/** The same settings object and distance always share a render-view identity. */
export const withSpatialLens = (base: SpatialSettings, distance?: number): SpatialView => {
  if (distance === undefined || !Number.isFinite(distance) || distance <= 0) return base
  let cache = merged.get(base)
  if (!cache) {
    cache = new Map()
    merged.set(base, cache)
  }
  const existing = cache.get(distance)
  if (existing) return existing
  const view: SpatialView = { ...base, cameraDistance: distance }
  cache.set(distance, view)
  if (cache.size > MAX_MERGES_PER_VIEW) cache.delete(cache.keys().next().value ?? distance)
  return view
}
