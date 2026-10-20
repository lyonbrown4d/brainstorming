import { create } from 'zustand'

/** Process-local epoch: content edits and index restarts invalidate text queries. */
export const useContentIndexRevision = create(() => ({ revision: 0 }))

export const publishContentIndexRevision = (): void => {
  useContentIndexRevision.setState((state) => ({ revision: state.revision + 1 }))
}
