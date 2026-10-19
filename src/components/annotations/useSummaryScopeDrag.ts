import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { MindMapDocument } from '@core'
import type { TopicGroup } from '@core/extensions'
import { topicParents } from '@core/summary'
import type { LayoutNode } from '@layout'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import {
  summaryScopeAxis,
  summaryScopeCenter,
  summaryScopeIndex,
  type SummaryScopeAxis,
} from '@renderer/components/annotations/summary-scope'

type Edge = 'start' | 'end'
interface Drag {
  readonly pointerId: number
  readonly edge: Edge
  readonly start: number
  readonly end: number
  readonly axis: SummaryScopeAxis
  readonly origin: number
  readonly center: number
}

export const useSummaryScopeDrag = (
  document: MindMapDocument,
  group: TopicGroup,
  nodes: readonly LayoutNode[],
) => {
  const { screenToFlowPosition } = useReactFlow()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [preview, setPreview] = useState<readonly string[] | null>(null)
  const parents = topicParents(document)
  const first = group.topicIds[0]
  const parent = first === undefined ? undefined : document.topics[parents.get(first) ?? '']
  const firstTopic = first === undefined ? undefined : document.topics[first]
  const excluded = new Set([
    ...(document.floatingIds ?? []),
    ...(document.groups ?? []).flatMap((item) =>
      item.summaryTopicId === undefined ? [] : [item.summaryTopicId],
    ),
  ])
  const candidates = (parent?.children ?? []).filter(
    (id) => !excluded.has(id) && document.topics[id]?.side === firstTopic?.side,
  )
  const start = candidates.indexOf(first ?? '')
  const end = candidates.indexOf(group.topicIds.at(-1) ?? '')
  const valid =
    start >= 0 &&
    end >= start &&
    group.topicIds.length === end - start + 1 &&
    group.topicIds.every((id, index) => candidates[start + index] === id)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const candidateNodes = candidates.map((id) => byId.get(id))

  useEffect(() => {
    if (drag === null) return
    const cancel = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setDrag(null)
      setPreview(null)
    }
    window.addEventListener('keydown', cancel, true)
    return () => {
      window.removeEventListener('keydown', cancel, true)
    }
  }, [drag])

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, edge: Edge): void => {
    if (!valid || event.button !== 0) return
    const axis = summaryScopeAxis(candidateNodes.filter((node) => node !== undefined))
    const source = candidateNodes[edge === 'start' ? start : end]
    if (!source) return
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      pointerId: event.pointerId,
      edge,
      start,
      end,
      axis,
      origin: point[axis],
      center: summaryScopeCenter(source, axis),
    })
    setPreview(group.topicIds)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (drag?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const index = summaryScopeIndex(
      candidateNodes,
      drag.axis,
      drag.center,
      point[drag.axis] - drag.origin,
      drag.edge === 'start' ? 0 : drag.start,
      drag.edge === 'start' ? drag.end : candidates.length - 1,
      drag.edge === 'start' ? drag.start : drag.end,
    )
    setPreview(
      drag.edge === 'start'
        ? candidates.slice(index, drag.end + 1)
        : candidates.slice(drag.start, index + 1),
    )
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (drag?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (
      preview?.some((id, index) => group.topicIds[index] !== id) ||
      (preview && preview.length !== group.topicIds.length)
    ) {
      const current = document.groups?.find(({ id }) => id === group.id)
      if (current)
        runAnnotationCommand({ type: 'upsertGroup', group: { ...current, topicIds: preview } })
    }
    setDrag(null)
    setPreview(null)
  }
  const onPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (drag?.pointerId !== event.pointerId) return
    event.stopPropagation()
    setDrag(null)
    setPreview(null)
  }
  return {
    valid,
    previewIds: preview ?? group.topicIds,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
