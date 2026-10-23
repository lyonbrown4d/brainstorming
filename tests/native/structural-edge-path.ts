import { browser } from '@wdio/globals'

/** Read the actual rendered branch, including its subpath inside a dense SVG batch. */
export const nativeStructuralEdgePath = async (edgeId?: string): Promise<string> =>
  browser.execute((id) => {
    const direct = id
      ? document.querySelector(
          `.react-flow__edge[data-id="${CSS.escape(id)}"] path.react-flow__edge-path`,
        )
      : document.querySelector('[data-testid="structural-edge-layer"] path.react-flow__edge-path')
    if (direct) return direct.getAttribute('d')?.trim() ?? ''
    for (const path of document.querySelectorAll('path[data-structural-edge-ids]')) {
      const ids: unknown = JSON.parse(path.getAttribute('data-structural-edge-ids') ?? '[]')
      if (!Array.isArray(ids)) continue
      const index = ids.indexOf(id)
      if (index < 0) continue
      // Only ordinary cubic/straight paths enter a batch; each has a single Move command.
      return (
        path
          .getAttribute('d')
          ?.match(/M[^M]*/g)
          ?.[index]?.trim() ?? ''
      )
    }
    return ''
  }, edgeId)
