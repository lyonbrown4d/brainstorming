import { useLayoutEffect, useRef } from 'react'
import { useMemoizedFn } from 'ahooks'
import type { NodePositionChange } from '@xyflow/react'
import { createCanvasPositionQueue } from '@renderer/lib/canvasPositionQueue'

/** Gesture completion drains pending coordinates; cancellation and unmount discard them. */
export const useCanvasPositionFrames = (commit: (changes: NodePositionChange[]) => void) => {
  const latest = useMemoizedFn(commit)
  const queue = useRef<ReturnType<typeof createCanvasPositionQueue> | null>(null)
  useLayoutEffect(() => {
    const current = createCanvasPositionQueue(latest)
    queue.current = current
    return () => {
      current.dispose()
      if (queue.current === current) queue.current = null
    }
  }, [latest])
  const request = useMemoizedFn((changes: NodePositionChange[]) => {
    if (queue.current) queue.current.request(changes)
    else latest(changes)
  })
  const flush = useMemoizedFn(() => {
    queue.current?.flush()
  })
  const clear = useMemoizedFn(() => {
    queue.current?.clear()
  })
  return { request, flush, clear }
}
