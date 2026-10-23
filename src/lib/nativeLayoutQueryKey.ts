import { hashKey, type QueryKey } from '@tanstack/react-query'

const hashes = new WeakMap<QueryKey, string>()

/** Retain TanStack's exact hash semantics while reusing immutable geometry keys. */
export const hashNativeLayoutKey = (key: QueryKey): string => {
  // Filters supplied by QueryClient callers may be mutable or contain objects.
  // Only the frozen, string-only keys produced by native layout queries are safe.
  if (!Object.isFrozen(key) || !key.every((part) => typeof part === 'string')) {
    return hashKey(key)
  }
  const cached = hashes.get(key)
  if (cached !== undefined) return cached
  const hash = hashKey(key)
  hashes.set(key, hash)
  return hash
}
