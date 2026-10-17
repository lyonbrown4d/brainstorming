import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

export interface ResourceSource {
  readonly path: string
  readonly password?: string
  readonly byteLength: number
  readonly mimeType: string
}

/** One object can have several authorized copies across documents and the encrypted staging vault. */
export class ResourceCatalog {
  private readonly objects = new Map<string, Map<string, ResourceSource>>()
  private readonly paths = new Map<string, string>()
  private readonly resolvedAliases = new Set<string>()
  private refreshScheduled = false
  private canonicalPath = (path: string): string => {
    const absolute = resolve(path)
    const cached = this.paths.get(absolute)
    if (cached && (cached === absolute || this.resolvedAliases.has(absolute))) return cached
    let canonical: string
    try {
      canonical = realpathSync.native(absolute)
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      )
        return cached ?? absolute
      throw error
    }
    this.paths.set(absolute, canonical)
    this.paths.set(canonical, canonical)
    if (absolute !== canonical) {
      this.resolvedAliases.add(absolute)
      if (!this.refreshScheduled) {
        this.refreshScheduled = true
        // Resource registration is synchronous; resolve one alias once for the whole asset batch.
        queueMicrotask(() => {
          this.resolvedAliases.clear()
          this.refreshScheduled = false
        })
      }
    }
    return canonical
  }
  set = (id: string, source: ResourceSource): void => {
    const copies = this.objects.get(id) ?? new Map<string, ResourceSource>()
    const path = this.canonicalPath(source.path)
    copies.delete(path)
    copies.set(path, { ...source, path })
    this.objects.set(id, copies)
  }
  get = (id: string): ResourceSource | undefined => {
    const copies = this.objects.get(id)
    return copies ? [...copies.values()].at(-1) : undefined
  }
  has = (id: string): boolean => this.objects.has(id)
  updatePassword = (path: string, password: string | null): void => {
    path = this.canonicalPath(path)
    for (const copies of this.objects.values()) {
      const source = copies.get(path)
      if (!source) continue
      copies.set(path, {
        path,
        byteLength: source.byteLength,
        mimeType: source.mimeType,
        ...(password ? { password } : {}),
      })
    }
  }
  /** A last copy stays reachable for another tab's paste/undo; its private file must stay until shutdown. */
  retirePath = (path: string): boolean => {
    path = this.canonicalPath(path)
    let removable = true
    for (const copies of this.objects.values()) {
      if (!copies.has(path)) continue
      if (copies.size > 1) copies.delete(path)
      else removable = false
    }
    return removable
  }
  clear = (): void => {
    this.objects.clear()
    this.paths.clear()
    this.resolvedAliases.clear()
  }
}
