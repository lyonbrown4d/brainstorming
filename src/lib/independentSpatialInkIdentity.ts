import type { MindMapDocument } from '@core'

interface SpatialInkIdentity {
  readonly byDrawing: ReadonlyMap<string, string>
  readonly byKey: ReadonlyMap<string, string>
}
const identities = new WeakMap<MindMapDocument, SpatialInkIdentity>()

/** Renderer keys are session identities; canonical topic and drawing IDs remain unchanged. */
export const independentSpatialInkIdentity = (document: MindMapDocument): SpatialInkIdentity => {
  const cached = identities.get(document)
  if (cached) return cached
  const used = new Set(Object.keys(document.topics))
  const byDrawing = new Map<string, string>(),
    byKey = new Map<string, string>()
  for (const stroke of document.drawings ?? []) {
    const base = `ink-${stroke.id}`
    let key = base,
      suffix = 1
    while (used.has(key)) key = `${base}-${suffix++}`
    used.add(key)
    byDrawing.set(stroke.id, key)
    byKey.set(key, stroke.id)
  }
  const identity = { byDrawing, byKey }
  identities.set(document, identity)
  return identity
}

/** Only persisted strokes are assigned a key; stale selection IDs cannot resolve to topics. */
export const independentSpatialInkKey = (document: MindMapDocument, drawingId: string): string => {
  const key = independentSpatialInkIdentity(document).byDrawing.get(drawingId)
  if (!key) throw new Error(`Missing Three ink identity for ${drawingId}`)
  return key
}
