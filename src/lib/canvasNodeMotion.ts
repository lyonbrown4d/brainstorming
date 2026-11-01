import { animate } from 'motion'
import { isEqual } from 'lodash-es'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { preserveMeasurement } from '@renderer/lib/canvasDragNodes'

export const CANVAS_MOTION_LIMIT = 32
export const CANVAS_MOTION_DURATION = 0.2

interface MotionEntry {
  readonly from: CanvasFlowNode
  readonly to: CanvasFlowNode
  readonly entering: boolean
  readonly leaving: boolean
  readonly appearance: boolean
}

/** Only a bounded set of changed topics animates; untouched node identities stay stable. */
export const canvasNodeMotionPlan = (
  previous: readonly CanvasFlowNode[],
  next: readonly CanvasFlowNode[],
): Map<string, MotionEntry> => {
  const before = new Map(previous.map((node) => [node.id, node]))
  const after = new Map(next.map((node) => [node.id, node]))
  const entries = new Map<string, MotionEntry>()
  for (const node of next) {
    if (node.type !== 'topic') continue
    const old = before.get(node.id)
    const appearance =
      old?.type === 'topic' &&
      (!isEqual(old.data.topic.style, node.data.topic.style) ||
        old.data.fill !== node.data.fill ||
        old.data.color !== node.data.color ||
        old.data.textColor !== node.data.textColor ||
        old.data.fontFamily !== node.data.fontFamily ||
        old.data.visualStyle !== node.data.visualStyle)
    if (old?.position.x !== node.position.x || old.position.y !== node.position.y || appearance)
      entries.set(node.id, {
        from: old ?? node,
        to: node,
        entering: !old,
        leaving: false,
        appearance,
      })
    if (entries.size > CANVAS_MOTION_LIMIT) return new Map()
  }
  for (const node of previous) {
    if (node.type !== 'topic' || after.has(node.id)) continue
    entries.set(node.id, {
      from: node,
      to: node,
      entering: false,
      leaving: true,
      appearance: false,
    })
    if (entries.size > CANVAS_MOTION_LIMIT) return new Map()
  }
  return entries
}

/** Motion owns only session geometry; native commands, selection and history stay authoritative. */
export const createCanvasNodeMotion = (
  read: () => CanvasFlowNode[],
  write: (nodes: CanvasFlowNode[]) => void,
) => {
  let active: ReturnType<typeof animate> | undefined
  let targets: CanvasFlowNode[] | undefined
  let plan = new Map<string, MotionEntry>()
  const frame = (progress: number, finished = false) => {
    if (!targets) return
    const current = new Map(read().map((node) => [node.id, node]))
    const nodes = targets.map((target) => {
      const entry = plan.get(target.id)
      const live = current.get(target.id) ?? target
      if (!entry)
        return live.data === target.data &&
          live.position.x === target.position.x &&
          live.position.y === target.position.y
          ? live
          : { ...target, selected: live.selected ?? false }
      const opacity = entry.entering
        ? 0.3 + progress * 0.7
        : entry.appearance
          ? 0.65 + progress * 0.35
          : 1
      const style = { ...target.style, ...(finished ? {} : { opacity }) }
      return {
        ...preserveMeasurement(target, live),
        selected: live.selected ?? false,
        style,
        position: {
          x: entry.from.position.x + (target.position.x - entry.from.position.x) * progress,
          y: entry.from.position.y + (target.position.y - entry.from.position.y) * progress,
        },
      }
    })
    if (!finished)
      for (const entry of plan.values()) {
        if (!entry.leaving) continue
        nodes.push({
          ...entry.from,
          selected: false,
          selectable: false,
          draggable: false,
          connectable: false,
          focusable: false,
          domAttributes: { ...entry.from.domAttributes, inert: true, 'aria-hidden': true },
          className: `${entry.from.className ?? ''} pointer-events-none`,
          style: {
            ...entry.from.style,
            opacity: Math.max(0, 1 - progress * 1.5),
            pointerEvents: 'none',
          },
        })
      }
    write(nodes)
  }
  const finish = () => {
    active?.stop()
    active = undefined
    frame(1, true)
    targets = undefined
    plan.clear()
  }
  return {
    finish,
    publish: (next: CanvasFlowNode[], enabled: boolean) => {
      const before = read().filter((node) => !plan.get(node.id)?.leaving)
      active?.stop()
      active = undefined
      targets = next
      plan = enabled ? canvasNodeMotionPlan(before, next) : new Map<string, MotionEntry>()
      if (!plan.size) {
        write(next)
        targets = undefined
        return
      }
      frame(0)
      active = animate(0, 1, {
        duration: CANVAS_MOTION_DURATION,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (progress) => {
          frame(progress)
        },
        onComplete: () => {
          frame(1, true)
          targets = undefined
          plan.clear()
          active = undefined
        },
      })
    },
  }
}
