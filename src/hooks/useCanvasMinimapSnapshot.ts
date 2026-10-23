import { useLayoutEffect, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { fromEvent, merge, Subscription } from 'rxjs'
import { useStoreApi } from '@xyflow/react'
import { createCanvasMinimapQueue } from '@renderer/lib/canvasMinimapQueue'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'

export type CanvasMinimapStore = ReturnType<typeof useStoreApi>

/** The nested provider owns only a delayed view; navigation still uses the main pan/zoom. */
export const useCanvasMinimapSnapshot = (
  source: CanvasMinimapStore,
): RefObject<HTMLDivElement | null> => {
  const element = useRef<HTMLDivElement>(null)
  const target = useStoreApi()
  useLayoutEffect(() => {
    let previous: ReturnType<CanvasMinimapStore['getState']> | undefined
    let navigating = false
    const flush = () => {
      // Node dragging owns the frame budget. Read its final or cancelled state later.
      if (previous && useCanvasInteraction.getState().drag && !navigating) return
      const state = source.getState()
      const nodesChanged = previous?.nodes !== state.nodes
      if (
        previous &&
        !nodesChanged &&
        previous.transform === state.transform &&
        previous.width === state.width &&
        previous.height === state.height &&
        previous.panZoom === state.panZoom &&
        previous.translateExtent === state.translateExtent &&
        previous.nodeOrigin === state.nodeOrigin &&
        previous.nodeExtent === state.nodeExtent &&
        previous.elevateNodesOnSelect === state.elevateNodesOnSelect &&
        previous.zIndexMode === state.zIndexMode &&
        previous.rfId === state.rfId &&
        previous.ariaLabelConfig === state.ariaLabelConfig
      )
        return
      const adoptionChanged =
        previous?.nodeOrigin !== state.nodeOrigin || previous.nodeExtent !== state.nodeExtent
      target.setState({
        width: state.width,
        height: state.height,
        transform: state.transform,
        panZoom: state.panZoom,
        translateExtent: state.translateExtent,
        nodeOrigin: state.nodeOrigin,
        nodeExtent: state.nodeExtent,
        elevateNodesOnSelect: state.elevateNodesOnSelect,
        zIndexMode: state.zIndexMode,
        rfId: `${state.rfId}-overview`,
        ariaLabelConfig: state.ariaLabelConfig,
      })
      if (nodesChanged || adoptionChanged) target.getState().setNodes(state.nodes)
      previous = state
    }
    // Seed once before the official MiniMap installs its navigation handlers.
    flush()
    const queue = createCanvasMinimapQueue(flush)
    const events = new Subscription()
    const syncViewport = () => {
      const { transform, width, height } = source.getState()
      const shown = target.getState()
      if (shown.transform !== transform || shown.width !== width || shown.height !== height)
        target.setState({ transform, width, height })
    }
    const capture = { capture: true }
    const overview = element.current
    if (overview) {
      events.add(
        merge(
          fromEvent(overview, 'mousedown', capture),
          fromEvent(overview, 'touchstart', capture),
        ).subscribe(() => {
          navigating = true
          flushSync(() => {
            flush()
            syncViewport()
          })
        }),
      )
      events.add(fromEvent(overview, 'wheel', capture).subscribe(syncViewport))
      // Register before D3 installs its gesture listeners. Its next incremental delta must
      // start from the live main viewport rather than the delayed overview's last frame.
      events.add(
        merge(
          fromEvent(window, 'mousemove', capture),
          fromEvent(window, 'touchmove', capture),
        ).subscribe(() => {
          if (navigating) syncViewport()
        }),
      )
      events.add(
        merge(
          fromEvent(window, 'mouseup', capture),
          fromEvent(window, 'touchend', capture),
          fromEvent(window, 'touchcancel', capture),
          fromEvent(window, 'blur', capture),
        ).subscribe(() => {
          if (navigating) queue.finish()
          navigating = false
        }),
      )
    }
    const unsubscribeSource = source.subscribe(() => {
      if (navigating) syncViewport()
      if (!useCanvasInteraction.getState().drag || navigating) queue.request()
    })
    const unsubscribeInteraction = useCanvasInteraction.subscribe((state, before) => {
      if (before.drag && !state.drag) queue.finish()
    })
    return () => {
      events.unsubscribe()
      unsubscribeSource()
      unsubscribeInteraction()
      queue.unsubscribe()
    }
  }, [source, target])
  return element
}
