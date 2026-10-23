import type { Command } from '@core'
import { measureTopic } from '@layout'
import { translate } from '@renderer/i18n'
import type {
  IndependentSpatialRuntime,
  SpatialSceneOffset,
} from '@renderer/lib/independentSpatialRuntime'
import { independentSpatialAnchor } from '@renderer/lib/independentSpatialGestureSession'
import { independentSpatialPointerPlane } from '@renderer/lib/independentSpatialGestureGeometry'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { useEditor } from '@renderer/state/editor'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { usePresentation } from '@renderer/state/presentation'
import { selectAnnotation, useAnnotationInteraction } from '@renderer/state/annotationInteraction'

export const independentSpatialFloatingCommand = (
  id: string,
  title: string,
  point: SpatialSceneOffset,
): Command => {
  const size = measureTopic(title)
  return {
    type: 'batch',
    commands: [
      {
        type: 'addFloatingTopic',
        id,
        title,
        x: point.x - size.width / 2,
        y: point.y - size.height / 2,
      },
      { type: 'setTopicStyle', topicId: id, style: { spatialDepth: point.z } },
    ],
  }
}

const editable = (runtime: IndependentSpatialRuntime): boolean => {
  const state = useEditor.getState()
  return (
    useCanvasInk.getState().mode === 'select' &&
    !state.busy &&
    !usePresentation.getState().playing &&
    state.history.document === runtime.model.document &&
    !runtime.navigating
  )
}

const floatingAt = (runtime: IndependentSpatialRuntime, event: MouseEvent) => {
  if (!runtime.camera || !runtime.canvas) return null
  runtime.freezeCamera()
  const focus = independentSpatialAnchor(runtime, useEditor.getState().selectedId) ?? {
    x: 0,
    y: 0,
    z: 0,
  }
  return independentSpatialPointerPlane(
    runtime.camera,
    runtime.canvas.getBoundingClientRect(),
    focus,
  )({ x: event.clientX, y: event.clientY })
}

export const independentSpatialDoubleClick =
  (runtime: IndependentSpatialRuntime) => (event: MouseEvent) => {
    if (!editable(runtime) || useAnnotationInteraction.getState().relationMode) return
    const hit = runtime.pick(event.clientX, event.clientY)
    if (hit?.kind === 'topic') {
      useEditor.getState().startEdit(hit.id, undefined, 'canvas')
      return
    }
    if (hit) return
    const point = floatingAt(runtime, event)
    if (!point) return
    const id = crypto.randomUUID()
    if (
      runAnnotationCommand(independentSpatialFloatingCommand(id, translate('floatingTopic'), point))
    )
      useEditor.getState().startEdit(id)
  }

/** Armed blank actions use real Three coordinates; a camera drag cannot become a click. */
export const bindIndependentSpatialBlankActions = (
  runtime: IndependentSpatialRuntime,
): (() => void) => {
  const canvas = runtime.canvas
  if (!canvas) return () => undefined
  let start: { x: number; y: number; pointer: number; moved: boolean } | null = null
  const down = (event: PointerEvent) => {
    start =
      event.button === 0 && !event.shiftKey && !runtime.pick(event.clientX, event.clientY)
        ? { x: event.clientX, y: event.clientY, pointer: event.pointerId, moved: false }
        : null
  }
  const move = (event: PointerEvent) => {
    if (
      start?.pointer === event.pointerId &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 4
    )
      start.moved = true
  }
  const cancel = () => {
    start = null
  }
  const click = (event: MouseEvent) => {
    const active = start
    start = null
    if (
      !active ||
      active.moved ||
      Math.hypot(event.clientX - active.x, event.clientY - active.y) >= 4 ||
      !editable(runtime) ||
      runtime.pick(event.clientX, event.clientY)
    )
      return
    const interaction = useAnnotationInteraction.getState(),
      state = useEditor.getState()
    if (
      (interaction.floating || interaction.relationMode) &&
      interaction.sheetId !== state.activeSheetId
    ) {
      useAnnotationInteraction.setState({
        floating: false,
        relationMode: false,
        fromId: null,
        sheetId: null,
      })
      return
    }
    if (!interaction.floating && !interaction.relationMode) {
      useAnnotationInteraction.setState({ selected: null, editing: false })
      return
    }
    const point = floatingAt(runtime, event)
    if (!point) return
    event.preventDefault()
    const id = crypto.randomUUID(),
      floating = independentSpatialFloatingCommand(id, translate('floatingTopic'), point)
    if (interaction.relationMode) {
      if (!interaction.fromId) {
        if (runAnnotationCommand(floating)) useAnnotationInteraction.setState({ fromId: id })
        return
      }
      const relationId = crypto.randomUUID()
      if (
        runAnnotationCommand({
          type: 'batch',
          commands: [
            floating,
            {
              type: 'upsertRelation',
              relation: {
                id: relationId,
                from: interaction.fromId,
                to: id,
                title: translate('relationship'),
                arrow: 'end',
              },
            },
          ],
        })
      )
        selectAnnotation('relation', relationId, true)
      return
    }
    if (runAnnotationCommand(floating)) {
      useAnnotationInteraction.setState({ floating: false })
      useEditor.getState().startEdit(id)
    }
  }
  canvas.addEventListener('pointerdown', down, true)
  window.addEventListener('pointermove', move, true)
  canvas.addEventListener('click', click)
  window.addEventListener('pointercancel', cancel, true)
  window.addEventListener('blur', cancel)
  return () => {
    canvas.removeEventListener('pointerdown', down, true)
    window.removeEventListener('pointermove', move, true)
    canvas.removeEventListener('click', click)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('blur', cancel)
  }
}
