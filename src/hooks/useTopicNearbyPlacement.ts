import { useLayoutEffect, useState } from 'react'
import { useStoreApi } from '@xyflow/react'
import { nodeToRect, type Position, type Rect } from '@xyflow/system'
import { debounce } from 'lodash-es'
import { useEditor } from '@renderer/state/editor'
import { topicNearbyPlacement, topicNearbySize } from '@renderer/lib/topicNearbyPlacement'

/** Read settled geometry; panning and dragging must not scan all nodes each frame. */
export const useTopicNearbyPlacement = (id: string | undefined): Position | null => {
  const store = useStoreApi()
  const root = useEditor((state) => state.history.document.rootId === id)
  const [position, setPosition] = useState<Position | null>(null)
  useLayoutEffect(() => {
    if (!id) {
      setPosition(null)
      return
    }
    const place = () => {
      const state = store.getState()
      const selected = state.nodeLookup.get(id)
      if (!selected || selected.dragging || selected.resizing) {
        setPosition(null)
        return
      }
      const [x, y, zoom] = state.transform
      const screen = (bounds: Rect) => {
        return {
          x: bounds.x * zoom + x,
          y: bounds.y * zoom + y,
          width: bounds.width * zoom,
          height: bounds.height * zoom,
        }
      }
      const obstacles = [...state.nodeLookup.values()]
        .filter((node) => node.id !== id && !node.hidden)
        .map((node) => screen(nodeToRect(node)))
      const choice = topicNearbyPlacement(
        screen(nodeToRect(selected)),
        topicNearbySize(root),
        obstacles,
        {
          x: 0,
          y: 0,
          width: state.width,
          height: state.height,
        },
      )
      setPosition(choice?.position ?? null)
    }
    const settled = debounce(place, 120)
    place()
    const stop = store.subscribe((state, previous) => {
      if (
        state.nodes === previous.nodes &&
        state.transform === previous.transform &&
        state.width === previous.width &&
        state.height === previous.height
      )
        return
      setPosition(null)
      settled()
    })
    return () => {
      stop()
      settled.cancel()
    }
  }, [id, root, store])
  return position
}
